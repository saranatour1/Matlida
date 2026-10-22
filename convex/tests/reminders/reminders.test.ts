import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

/** Every call the app made to Photon's API: path, idempotency key and body. */
const photon: Array<{ path: string; key?: string; body: unknown }> = []
let photonStatus = 200
const photonFetch = vi.fn((url: string, init?: RequestInit) => {
  const path = url.replace(
    'https://api.photon.codes/v1/projects/pho_prj_test',
    '',
  )
  const body = JSON.parse(init?.body as string) as { handle?: string }
  photon.push({
    path,
    key: (init?.headers as Record<string, string>)['idempotency-key'],
    body,
  })
  if (photonStatus !== 200) {
    return Promise.resolve(Response.json({}, { status: photonStatus }))
  }
  const id =
    path === '/users'
      ? `user:${body.handle}`
      : path === '/spaces'
        ? 'space-1'
        : 'sent-1'
  return Promise.resolve(Response.json({ id }))
})

beforeEach(() => {
  vi.useFakeTimers()
  photon.length = 0
  photonStatus = 200
  vi.stubGlobal('fetch', photonFetch)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const setup = async () => {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  const ada = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Ada', email: 'ada@example.com' }),
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
  return { t, asAda, projectId, threadId }
}

const HOUR = 60 * 60 * 1000

test('a due text reminder lands in the chat when texting is not linked', async () => {
  const { t, asAda, projectId, threadId } = await setup()
  await t.mutation(internal.api.reminders.schedule, {
    projectId,
    threadId,
    from: 'Matilda',
    message: 'Call the bank',
    dueAt: Date.now() + HOUR,
    via: 'text',
  })
  expect(await asAda.query(api.api.reminders.list, { projectId })).toHaveLength(
    1,
  )

  await t.finishAllScheduledFunctions(vi.runAllTimers)

  expect(await asAda.query(api.api.reminders.list, { projectId })).toEqual([])
  const [reminder] = await t.run((ctx) => ctx.db.query('reminders').take(10))
  expect(reminder).toMatchObject({
    status: 'sent',
    note: "Texting isn't linked, so it's only here.",
  })
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page[0]?.text).toContain('Call the bank')
})

/** Email set up on the deployment, and Ada's address claimed. */
const withEmail = async (setupResult: Awaited<ReturnType<typeof setup>>) => {
  vi.stubEnv('MAIL_DOMAIN', 'mail.example.com')
  vi.stubEnv('PHOTON_PROJECT_ID', 'pho_prj_test')
  vi.stubEnv('PHOTON_API_KEY', 'pho_sk_test')
  const { asAda, projectId } = setupResult
  await asAda.mutation(api.api.mailboxes.claim, { projectId, handle: 'ada' })
}

const emailReminder = async (t: Awaited<ReturnType<typeof setup>>) => {
  return await t.t.mutation(internal.api.reminders.schedule, {
    projectId: t.projectId,
    threadId: t.threadId,
    from: 'Matilda',
    message: 'Call the bank',
    dueAt: Date.now() + HOUR,
    via: 'email',
  })
}

test('a due email reminder is emailed to the owner from their assistant address', async () => {
  const s = await setup()
  await withEmail(s)
  const id = await emailReminder(s)
  await s.t.finishAllScheduledFunctions(vi.runAllTimers)

  expect(photon).toEqual([
    {
      path: '/users',
      key: undefined,
      body: { handle: 'ada@mail.example.com', platform: 'email' },
    },
    {
      path: '/users',
      key: undefined,
      body: { handle: 'ada@example.com', platform: 'email' },
    },
    {
      path: '/spaces',
      key: `reminder:${id}`,
      body: {
        platform: 'email',
        participantIds: ['user:ada@mail.example.com', 'user:ada@example.com'],
      },
    },
    {
      path: '/messages',
      key: `reminder:${id}`,
      body: {
        spaceId: 'space-1',
        senderId: 'user:ada@mail.example.com',
        content: {
          type: 'text',
          format: 'plain',
          text: 'Call the bank\n\nMatilda',
        },
        email: {
          subject: 'Reminder: Call the bank',
          to: [{ address: 'ada@example.com' }],
        },
      },
    },
  ])
  const [reminder] = await s.t.run((ctx) => ctx.db.query('reminders').take(10))
  expect(reminder).toMatchObject({ status: 'sent' })
  expect(reminder.note).toBeUndefined()
})

test('an email reminder without an address only lands in the chat', async () => {
  const s = await setup()
  await emailReminder(s)
  await s.t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(photon).toEqual([])
  const [reminder] = await s.t.run((ctx) => ctx.db.query('reminders').take(10))
  expect(reminder).toMatchObject({
    status: 'sent',
    note: "Email isn't set up, so it's only here.",
  })
})

test("an email reminder Photon can't send still lands in the chat, with a note", async () => {
  const s = await setup()
  await withEmail(s)
  photonStatus = 502
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await emailReminder(s)
  await s.t.finishAllScheduledFunctions(vi.runAllTimers)
  const [reminder] = await s.t.run((ctx) => ctx.db.query('reminders').take(10))
  expect(reminder).toMatchObject({
    status: 'sent',
    note: "The email couldn't be sent, so it's only here.",
  })
})

test('a cancelled reminder never fires', async () => {
  const { t, asAda, projectId, threadId } = await setup()
  const id = await t.mutation(internal.api.reminders.schedule, {
    projectId,
    threadId,
    from: 'Matilda',
    message: 'Stretch',
    dueAt: Date.now() + HOUR,
    via: 'chat',
  })
  await asAda.mutation(api.api.reminders.cancel, { id })
  await t.finishAllScheduledFunctions(vi.runAllTimers)

  expect(await t.run((ctx) => ctx.db.get('reminders', id))).toMatchObject({
    status: 'cancelled',
  })
})

test('reminders in the past or over a year out are refused', async () => {
  const { t, projectId, threadId } = await setup()
  for (const dueAt of [Date.now() - HOUR, Date.now() + 400 * 24 * HOUR]) {
    await expect(
      t.mutation(internal.api.reminders.schedule, {
        projectId,
        threadId,
        from: 'Matilda',
        message: 'Nope',
        dueAt,
        via: 'chat',
      }),
    ).rejects.toThrow()
  }
})
