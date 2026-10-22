import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import { afterMissedCall } from '../../lib/decide'
import { inDaytime } from '../../models/reminders/functions'
import schema from '../../schema'
import { modules } from '../../test.setup'
import type * as Decide from '../../lib/decide'

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/decide', async (original) => ({
  ...(await original<typeof Decide>()),
  afterMissedCall: vi.fn(),
}))

const MINUTE = 60_000
const jev = vi.mocked(afterMissedCall)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
  jev.mockReset()
  jev.mockResolvedValue({ next: 'call_again_soon', probability: 0.8, cost: 0 })
})
afterEach(() => {
  vi.useRealTimers()
})

const setup = async () => {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  const ada = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Ada', timeZone: 'UTC' }),
  )
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  const threadId = await t.mutation(internal.api.threads.startMain, {
    projectId,
  })
  const id = await t.mutation(internal.api.reminders.schedule, {
    projectId,
    threadId,
    from: 'Matilda',
    message: 'Take your pills',
    dueAt: Date.now() + MINUTE,
    via: 'call',
  })
  const after = async (ms: number) => {
    vi.advanceTimersByTime(ms)
    await t.finishInProgressScheduledFunctions()
  }
  const reminder = () => t.run((ctx) => ctx.db.get('reminders', id))
  return { t, asAda, threadId, id, after, reminder }
}

test('a missed call rings again when Jev says so, and says when in the chat', async () => {
  const { asAda, threadId, after, reminder } = await setup()
  await after(MINUTE)
  await after(30_000)

  expect(await reminder()).toMatchObject({ status: 'scheduled', attempts: 1 })
  expect(jev).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      reminder: 'Take your pills',
      attempts: 1,
      declined: false,
    }),
  )
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page[0]?.text).toContain('Matilda will call again at 12:11 PM')

  await after(10 * MINUTE)
  expect(await asAda.query(api.api.reminders.ringing, {})).toMatchObject([
    { again: true },
  ])
})

test('she stops after three missed calls', async () => {
  const { after, reminder } = await setup()
  await after(MINUTE)
  for (let i = 0; i < 3; i++) {
    await after(30_000)
    await after(10 * MINUTE)
  }
  expect(await reminder()).toMatchObject({
    status: 'sent',
    note: 'You missed the call.',
    attempts: 2,
  })
  // The third miss is the last: no need to ask.
  expect(jev).toHaveBeenCalledTimes(2)
})

test('a call-again after 9pm waits until 9am', () => {
  expect(inDaytime(Date.parse('2026-10-22T22:30:00Z'), 'UTC')).toBe(
    Date.parse('2026-10-23T09:00:00Z'),
  )
  expect(inDaytime(Date.parse('2026-10-22T03:15:00Z'), 'UTC')).toBe(
    Date.parse('2026-10-22T09:00:00Z'),
  )
  expect(inDaytime(Date.parse('2026-10-22T12:00:00Z'), 'UTC')).toBe(
    Date.parse('2026-10-22T12:00:00Z'),
  )
  // 9:30pm in Amman (UTC+3) is 6:30pm UTC; 9am there is 6am UTC.
  expect(inDaytime(Date.parse('2026-10-22T18:30:00Z'), 'Asia/Amman')).toBe(
    Date.parse('2026-10-23T06:00:00Z'),
  )
})

test('snooze rings again in 10 minutes, without asking Jev', async () => {
  const { asAda, id, after, reminder } = await setup()
  await after(MINUTE)
  await asAda.mutation(api.api.reminders.snooze, { id })
  expect(await asAda.query(api.api.reminders.ringing, {})).toEqual([])
  await after(30_000)
  expect(await reminder()).toMatchObject({ status: 'scheduled' })

  await after(10 * MINUTE)
  expect(await asAda.query(api.api.reminders.ringing, {})).toHaveLength(1)
  expect(jev).not.toHaveBeenCalled()
})

test('declining asks Jev, and leaving it in the chat ends it', async () => {
  jev.mockResolvedValue({ next: 'leave_in_chat', probability: 0.8, cost: 0 })
  const { asAda, id, after, reminder } = await setup()
  await after(MINUTE)
  await asAda.mutation(api.api.reminders.decline, { id })
  await after(1)

  expect(jev).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ declined: true }),
  )
  expect(await reminder()).toMatchObject({
    status: 'sent',
    note: 'You declined the call.',
  })
})
