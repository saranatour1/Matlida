import agentTest from '@convex-dev/agent/test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'
import type { Id } from '../../lib/ctx'

/** Every call the app made to Photon's API: path and body. */
const photon: Array<{ path: string; body: Record<string, unknown> }> = []
const photonFetch = vi.fn((url: string, init?: RequestInit) => {
  const path = url.replace(
    'https://api.photon.codes/v1/projects/pho_prj_test',
    '',
  )
  const body = JSON.parse(init?.body as string) as Record<string, unknown>
  photon.push({ path, body })
  const id =
    path === '/users'
      ? `user:${String(body.handle)}`
      : path === '/spaces'
        ? 'space-1'
        : 'sent-1'
  return Promise.resolve(Response.json({ id }))
})

beforeEach(() => {
  vi.useFakeTimers()
  photon.length = 0
  vi.stubGlobal('fetch', photonFetch)
  vi.stubEnv('MAIL_DOMAIN', 'mail.example.com')
  vi.stubEnv('PHOTON_PROJECT_ID', 'pho_prj_test')
  vi.stubEnv('PHOTON_API_KEY', 'pho_sk_test')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const HOUR = 60 * 60 * 1000

const setup = async () => {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  rateLimiterTest.register(t)
  const [ada, bob] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { name: 'Sara', email: 'sara@example.com' }),
    await ctx.db.insert('users', { name: 'Bob', email: 'bob@example.com' }),
  ])
  const asAda = t.withIdentity({ subject: ada })
  const asBob = t.withIdentity({ subject: bob })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  await asAda.mutation(api.api.mailboxes.claim, { projectId, handle: 'sara' })
  const threadId = await t.mutation(internal.api.threads.startMain, {
    projectId,
  })
  const luke = await t.mutation(internal.api.contacts.save, {
    projectId,
    name: 'Luke',
    email: 'luke@example.org',
  })
  /** What set_reminder schedules for "tell Luke in an hour to check his car insurance". */
  const tellLuke = (contactId: Id<'contacts'> = luke) =>
    t.mutation(internal.api.reminders.schedule, {
      projectId,
      threadId,
      from: 'Matilda',
      message: 'Remind Luke about his car insurance',
      dueAt: Date.now() + HOUR,
      via: 'email',
      contactId,
      toName: 'Luke',
      say: 'Hi Luke, Sara asked me to remind you to check on your car insurance.',
    })
  const reminder = (id: Id<'reminders'>) =>
    t.run((ctx) => ctx.db.get('reminders', id))
  const chat = async () => {
    const { page } = await asAda.query(api.api.chat.listMessages, {
      threadId,
      paginationOpts: { numItems: 10, cursor: null },
    })
    return page.map((m) => m.text)
  }
  return {
    t,
    asAda,
    asBob,
    projectId,
    luke,
    tellLuke,
    reminder,
    chat,
  }
}

test('contacts are saved once per name and found by the start of it', async () => {
  const { t, asAda, asBob, projectId, luke } = await setup()
  const again = await t.mutation(internal.api.contacts.save, {
    projectId,
    name: 'luke',
    phone: '+14155550123',
  })
  expect(again).toBe(luke)
  await t.mutation(internal.api.contacts.save, {
    projectId,
    name: 'Lucy',
  })
  const found = await t.query(internal.api.contacts.find, {
    projectId,
    name: 'lu',
  })
  expect(found.map((c) => c.name)).toEqual(['Lucy', 'Luke'])
  expect(found[1]).toMatchObject({
    email: 'luke@example.org',
    phone: '+14155550123',
  })
  expect(await asAda.query(api.api.contacts.list, { projectId })).toHaveLength(
    2,
  )
  await expect(
    asBob.query(api.api.contacts.list, { projectId }),
  ).rejects.toThrow('Project not found.')
})

test('a message to a contact waits for your OK, then is emailed and noted in the chat', async () => {
  const { t, asAda, tellLuke, reminder, chat } = await setup()
  const id = await tellLuke()
  expect(await asAda.query(api.api.reminders.state, { id })).toBe('pending')

  // Without an OK, nothing goes out, even after it's due.
  await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(2 * HOUR))
  expect(photon).toEqual([])

  await asAda.mutation(api.api.reminders.confirm, { id })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(photon.at(-1)).toEqual({
    path: '/messages',
    body: {
      spaceId: 'space-1',
      senderId: 'user:sara@mail.example.com',
      content: {
        type: 'text',
        format: 'plain',
        text: "Hi Luke, Sara asked me to remind you to check on your car insurance.\n\nMatilda, Sara's assistant. This message was sent automatically.",
      },
      email: {
        subject: 'A message from Sara',
        to: [{ address: 'luke@example.org' }],
      },
    },
  })
  expect(await reminder(id)).toMatchObject({ status: 'sent' })
  expect(await chat()).toContain(
    '📨 **To Luke:** Hi Luke, Sara asked me to remind you to check on your car insurance.',
  )
})

test('a cancelled message to a contact is never sent', async () => {
  const { t, asAda, tellLuke, reminder } = await setup()
  const id = await tellLuke()
  await asAda.mutation(api.api.reminders.cancel, { id })
  await asAda.mutation(api.api.reminders.confirm, { id })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(photon).toEqual([])
  expect(await reminder(id)).toMatchObject({ status: 'cancelled' })
})

test('only the owner can confirm a message to a contact', async () => {
  const { asBob, tellLuke } = await setup()
  const id = await tellLuke()
  await expect(
    asBob.mutation(api.api.reminders.confirm, { id }),
  ).rejects.toThrow('Project not found.')
})

test('a contact with no email gets nothing, and the chat says why', async () => {
  const { t, asAda, projectId, tellLuke, reminder } = await setup()
  const nobody = await t.mutation(internal.api.contacts.save, {
    projectId,
    name: 'Nobody',
  })
  const id = await tellLuke(nobody)
  await asAda.mutation(api.api.reminders.confirm, { id })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(photon).toEqual([])
  expect(await reminder(id)).toMatchObject({
    status: 'sent',
    note: "There's no email for them, so it wasn't sent.",
  })
})

test('past 10 messages to contacts at once, the rest wait for the limit', async () => {
  const { t, asAda, tellLuke, reminder } = await setup()
  const ids: Array<Id<'reminders'>> = []
  for (let i = 0; i < 11; i++) ids.push(await tellLuke())
  for (const id of ids) await asAda.mutation(api.api.reminders.confirm, { id })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(photon.filter((p) => p.path === '/messages')).toHaveLength(10)
  expect(await reminder(ids[10])).toMatchObject({
    note: 'Too many messages to contacts today, so it wasn’t sent.',
  })
})
