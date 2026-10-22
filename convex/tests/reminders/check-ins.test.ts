import agentTest from '@convex-dev/agent/test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import { afterMissedCall, shouldCallNow } from '../../lib/decide'
import schema from '../../schema'
import { modules } from '../../test.setup'
import type * as Decide from '../../lib/decide'

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/decide', async (original) => ({
  ...(await original<typeof Decide>()),
  shouldCallNow: vi.fn(),
  afterMissedCall: vi.fn(),
}))

const HOUR = 60 * 60 * 1000
const jev = vi.mocked(shouldCallNow)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-22T09:30:00Z'))
  jev.mockReset()
  jev.mockResolvedValue({ callNow: 0.9, about: 'the tax form', cost: 0 })
})
afterEach(() => {
  vi.useRealTimers()
})

const setup = async (user: { checkIns?: boolean } = {}) => {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  rateLimiterTest.register(t)
  const ada = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Ada', timeZone: 'UTC', ...user }),
  )
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  await t.mutation(internal.api.threads.startMain, { projectId })
  /** Ada last messaged Matilda `ago` before now. */
  const chatted = (ago: number) =>
    t.run((ctx) =>
      ctx.db.patch('users', ada, {
        lastChat: { projectId, at: Date.now() - ago },
      }),
    )
  await chatted(3 * HOUR)
  const run = async () => {
    await t.action(internal.api.checkIns.run, {})
    vi.advanceTimersByTime(1)
    await t.finishInProgressScheduledFunctions()
  }
  const reminders = () => t.run((ctx) => ctx.db.query('reminders').take(10))
  return { t, asAda, chatted, run, reminders }
}

test('Jev decides to check in, and the assistant rings about it', async () => {
  const { asAda, run, reminders } = await setup()
  await run()
  expect(await reminders()).toMatchObject([
    {
      kind: 'checkin',
      via: 'call',
      status: 'ringing',
      message: 'Checking in about: the tax form',
    },
  ])
  expect(await asAda.query(api.api.reminders.ringing, {})).toMatchObject([
    { from: 'Matilda', checkIn: true },
  ])
})

test('no call when Jev is unsure', async () => {
  jev.mockResolvedValue({ callNow: 0.5, about: null, cost: 0 })
  const { run, reminders } = await setup()
  await run()
  expect(await reminders()).toEqual([])
})

test('nobody is asked at night, with check-ins off, or right after chatting', async () => {
  vi.setSystemTime(new Date('2026-10-22T22:00:00Z'))
  const night = await setup()
  await night.run()
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
  const off = await setup({ checkIns: false })
  await off.run()
  const busy = await setup()
  await busy.chatted(10 * 60_000)
  await busy.run()
  expect(jev).not.toHaveBeenCalled()
})

test('at most 3 check-ins a day, and 2 hours apart', async () => {
  const { t, chatted, run, reminders } = await setup()
  for (const hour of ['09:30', '10:30', '12:00', '15:00', '18:00']) {
    vi.setSystemTime(new Date(`2026-10-22T${hour}:00Z`))
    await chatted(3 * HOUR)
    await run()
    // Each ring goes unanswered.
    await t.run(async (ctx) => {
      for (const r of await ctx.db.query('reminders').take(10)) {
        await ctx.db.patch('reminders', r._id, { status: 'sent' })
      }
    })
  }
  // 10:30 is too soon after 9:30, and 18:00 is the 4th.
  expect(await reminders()).toHaveLength(3)
})

test('a missed check-in is left in the chat, without another call', async () => {
  const { t, run, reminders } = await setup()
  await run()
  vi.advanceTimersByTime(30_000)
  await t.finishInProgressScheduledFunctions()
  expect(await reminders()).toMatchObject([
    { status: 'sent', note: 'You missed the call.' },
  ])
  expect(afterMissedCall).not.toHaveBeenCalled()
})
