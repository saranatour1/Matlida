import agentTest from '@convex-dev/agent/test'
import { Crons } from '@convex-dev/crons'
import cronsTest from '@convex-dev/crons/test'
import { convexTest } from 'convex-test'
import { beforeEach, expect, test, vi } from 'vitest'
import { api, components, internal } from '../../_generated/api'
import { checkRecurring } from '../../lib/decide'
import { cronFor } from '../../models/reminders/functions'
import schema from '../../schema'
import { modules } from '../../test.setup'
import type * as Decide from '../../lib/decide'
import type { Id } from '../../lib/ctx'

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/decide', async (original) => ({
  ...(await original<typeof Decide>()),
  checkRecurring: vi.fn(),
}))

const jev = vi.mocked(checkRecurring)
const said = (
  answer: Partial<Awaited<ReturnType<typeof checkRecurring>>> = {},
) =>
  jev.mockResolvedValue({
    stillNeeded: 0.9,
    action: 'deliver',
    channel: 'chat',
    channelProbability: 0.9,
    cost: 0,
    ...answer,
  })

beforeEach(() => {
  jev.mockReset()
  said()
})

// 9am in Amman (UTC+3) on Friday 2026-10-23.
const NINE_AM = Date.parse('2026-10-23T06:00:00Z')

const setup = async () => {
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
  const t = convexTest(schema, modules)
  agentTest.register(t)
  cronsTest.register(t)
  const ada = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Ada', timeZone: 'Asia/Amman' }),
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
  const schedule = (every?: 'once' | 'weekdays' | 'custom', cron?: string) =>
    t.mutation(internal.api.reminders.schedule, {
      projectId,
      threadId,
      from: 'Matilda',
      message: 'Stretch',
      dueAt: NINE_AM,
      via: 'chat',
      every,
      cron,
    })
  const cronOf = (id: string) =>
    t.run((ctx) =>
      new Crons(components.crons).get(ctx, { name: `reminder:${id}` }),
    )
  const reminder = (id: Id<'reminders'>) =>
    t.run((ctx) => ctx.db.get('reminders', id))
  const chat = async () =>
    (
      await asAda.query(api.api.chat.listMessages, {
        threadId,
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page.map((m) => m.text)
  return { t, asAda, projectId, schedule, cronOf, reminder, chat }
}

test('cron specs keep the time of day in your zone', () => {
  expect(cronFor('daily', NINE_AM, 'Asia/Amman')).toBe('0 9 * * *')
  expect(cronFor('weekdays', NINE_AM, 'Asia/Amman')).toBe('0 9 * * 1-5')
  expect(cronFor('weekly', NINE_AM, 'Asia/Amman')).toBe('0 9 * * 5')
  expect(cronFor('monthly', NINE_AM, 'Asia/Amman')).toBe('0 9 23 * *')
  expect(cronFor('daily', NINE_AM, 'Not/AZone')).toBe('0 6 * * *')
})

test('a recurring reminder registers a cron in your time zone', async () => {
  const { schedule, cronOf, reminder } = await setup()
  const id = await schedule('weekdays')
  expect(await reminder(id)).toMatchObject({
    status: 'scheduled',
    repeat: { every: 'weekdays', cronspec: '0 9 * * 1-5' },
  })
  expect(await cronOf(id)).toMatchObject({
    schedule: { kind: 'cron', cronspec: '0 9 * * 1-5', tz: 'Asia/Amman' },
  })
})

test('a one-off reminder never touches crons, and a custom one needs a spec', async () => {
  const { t, schedule } = await setup()
  await schedule('once')
  expect(await t.run((ctx) => new Crons(components.crons).list(ctx))).toEqual(
    [],
  )
  await expect(schedule('custom')).rejects.toThrow('needs `cron`')
  await expect(schedule('custom', 'every tuesday')).rejects.toThrow()
})

test('pause drops the cron, resume brings it back, stop ends it', async () => {
  const { asAda, schedule, cronOf, reminder } = await setup()
  const id = await schedule('weekdays')
  await asAda.mutation(api.api.reminders.pause, { id })
  expect(await reminder(id)).toMatchObject({ status: 'paused' })
  expect(await cronOf(id)).toBeNull()

  await asAda.mutation(api.api.reminders.resume, { id })
  expect(await reminder(id)).toMatchObject({ status: 'scheduled' })
  expect(await cronOf(id)).not.toBeNull()

  await asAda.mutation(api.api.reminders.cancel, { id })
  expect(await reminder(id)).toMatchObject({ status: 'cancelled' })
  expect(await cronOf(id)).toBeNull()
})

test('each time it fires it lands in the chat and waits for the next', async () => {
  const { t, schedule, reminder, chat } = await setup()
  const id = await schedule('weekdays')
  await t.action(internal.api.reminders.fire, { id })
  await t.action(internal.api.reminders.fire, { id })
  expect(await reminder(id)).toMatchObject({ status: 'scheduled' })
  expect((await chat()).filter((m) => m.includes('Stretch'))).toHaveLength(2)
})

test('Jev stops one that sounds done, and says so', async () => {
  said({ stillNeeded: 0.1 })
  const { t, schedule, cronOf, reminder, chat } = await setup()
  const id = await schedule('weekdays')
  await t.action(internal.api.reminders.fire, { id })
  expect(await reminder(id)).toMatchObject({ status: 'cancelled' })
  expect(await cronOf(id)).toBeNull()
  expect((await chat())[0]).toContain('I stopped reminding you')
})

test('Jev can pause or skip it, and only switches channel when sure', async () => {
  const { t, schedule, cronOf, reminder, chat } = await setup()
  const id = await schedule('weekdays')

  said({ action: 'skip_once' })
  await t.action(internal.api.reminders.fire, { id })
  expect(await chat()).toEqual([])

  said({
    action: 'notify_differently',
    channel: 'call',
    channelProbability: 0.5,
  })
  await t.action(internal.api.reminders.fire, { id })
  expect(await reminder(id)).toMatchObject({ status: 'scheduled' })

  said({
    action: 'notify_differently',
    channel: 'call',
    channelProbability: 0.8,
  })
  await t.action(internal.api.reminders.fire, { id })
  expect(await reminder(id)).toMatchObject({ status: 'ringing' })
  await t.mutation(internal.api.reminders.markSent, { id })

  said({ action: 'pause' })
  await t.action(internal.api.reminders.fire, { id })
  expect(await reminder(id)).toMatchObject({ status: 'paused' })
  expect(await cronOf(id)).toBeNull()
})
