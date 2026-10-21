import agentTest from '@convex-dev/agent/test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import { languageModel } from '../../lib/ai'
import schema from '../../schema'
import { modules } from '../../test.setup'

vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  return {
    languageModel: mockModel({
      content: [{ type: 'text', text: 'Hi from Matilda.' }],
    }),
  }
})

const calls = (languageModel as unknown as { doGenerateCalls: Array<unknown> })
  .doGenerateCalls

/** What Photon's message list returns, and every send made to it. */
let received: Array<unknown> = []
let sendStatus = 200
const sent: Array<{ headers: Record<string, string>; body: unknown }> = []
const photonFetch = vi.fn((url: string, init?: RequestInit) => {
  expect(url).toMatch(
    /^https:\/\/api\.photon\.codes\/v1\/projects\/pho_prj_test\//,
  )
  if (init?.method === 'POST') {
    sent.push({
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string),
    })
    return Promise.resolve(
      sendStatus === 200
        ? Response.json({ id: 'sent-1' })
        : Response.json({ code: 'UPSTREAM' }, { status: sendStatus }),
    )
  }
  return Promise.resolve(Response.json({ items: received }))
})

beforeEach(() => {
  calls.length = 0
  sent.length = 0
  received = []
  sendStatus = 200
  vi.stubGlobal('fetch', photonFetch)
  vi.stubEnv('MAIL_DOMAIN', 'mail.example.com')
  vi.stubEnv('PHOTON_PROJECT_ID', 'pho_prj_test')
  vi.stubEnv('PHOTON_API_KEY', 'pho_sk_test')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function email(
  id: string,
  from: string,
  text: string,
  { to = 'ada@mail.example.com', spam = false, name = 'Ada' } = {},
) {
  return {
    id,
    createdAt: new Date().toISOString(),
    platform: 'email',
    status: 'received',
    content: {
      type: 'text',
      format: 'plain',
      text,
      metadata: { email: { subject: 'Today' } },
    },
    metadata: { isSpam: spam },
    sentBy: { handle: from, metadata: { displayName: name } },
    receivedBy: { id: 'agent-user', handle: to },
    space: { id: 'space-1' },
  }
}

async function setup() {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  rateLimiterTest.register(t)
  const ada = await t.run((ctx) =>
    ctx.db.insert('users', { email: 'ada@example.com' }),
  )
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  await asAda.mutation(api.api.mailboxes.claim, { projectId, handle: 'ada' })
  const poll = () => t.action(internal.api.emails.poll, {})
  const chat = async (title: string) => {
    const chats = await asAda.query(api.api.threads.list, {
      projectId,
      kind: 'chat',
    })
    const thread = chats.find((c) => c.title === title)
    if (!thread) return null
    const { page } = await asAda.query(api.api.chat.listMessages, {
      threadId: thread.threadId,
      paginationOpts: { numItems: 10, cursor: null },
    })
    return page.map((m) => m.text)
  }
  const statuses = () =>
    t.run(async (ctx) =>
      (await ctx.db.query('emails').take(10)).map((e) => e.status),
    )
  const inbox = async (title: string) => {
    const chats = await asAda.query(api.api.threads.list, {
      projectId,
      kind: 'chat',
    })
    const thread = chats.find((c) => c.title === title)
    return thread
      ? await asAda.query(api.api.emails.forThread, {
          threadId: thread.threadId,
        })
      : []
  }
  return { t, asAda, poll, chat, statuses, inbox }
}

const replyTo = (to: string, text: string) => ({
  headers: expect.objectContaining({
    'idempotency-key': 'matilda-reply:m1',
  }) as unknown,
  body: {
    spaceId: 'space-1',
    senderId: 'agent-user',
    parentMessageId: 'm1',
    content: { type: 'text', format: 'plain', text },
    email: { to: [{ address: to }] },
  },
})

test('your own email gets a draft in the chat, and goes out only when you reply', async () => {
  const { asAda, poll, chat, statuses, inbox } = await setup()
  received = [
    email(
      'm1',
      'Ada@Example.com',
      'What is on today?\n\nOn Mon, Bob wrote:\n> old news',
    ),
  ]
  await poll()

  expect(sent).toEqual([])
  expect(JSON.stringify(calls)).toContain('You are drafting a reply to an email')
  expect(await chat('Matilda')).toEqual([
    'Today\n\nWhat is on today?',
    'Hi from Matilda.',
  ])
  expect(await statuses()).toEqual(['answered'])
  const [mail] = await inbox('Matilda')
  expect(mail).toMatchObject({
    from: 'ada@example.com',
    subject: 'Today',
    draft: 'Hi from Matilda.',
    repliedAt: null,
  })

  await asAda.action(api.api.emails.reply, {
    emailId: mail._id,
    text: ' Edited by Ada. ',
  })
  expect(sent).toEqual([replyTo('ada@example.com', 'Edited by Ada.')])
  expect((await chat('Matilda'))?.at(-1)).toBe(
    '↩️ **Replied to ada@example.com**\n\nEdited by Ada.',
  )
  await expect(
    asAda.action(api.api.emails.reply, { emailId: mail._id, text: 'Again' }),
  ).rejects.toThrow('You already replied to this one.')

  // The next check sees the same email again and leaves it.
  await poll()
  expect(sent).toHaveLength(1)
})

test("someone else's email shows in the lead's chat with a draft, and only you can reply", async () => {
  const { t, asAda, poll, chat, statuses, inbox } = await setup()
  received = [email('m1', 'bob@example.org', 'Lunch?', { name: 'Bob' })]
  await poll()

  expect(sent).toEqual([])
  expect(await chat('Matilda')).toEqual([
    '📨 **Bob <bob@example.org>**\n**Today**\n\nLunch?',
  ])
  expect(await statuses()).toEqual(['shown'])
  const [mail] = await inbox('Matilda')
  expect(mail).toMatchObject({
    from: 'bob@example.org',
    draft: 'Hi from Matilda.',
  })

  const eve = await t.run((ctx) => ctx.db.insert('users', {}))
  await expect(
    t
      .withIdentity({ subject: eve })
      .action(api.api.emails.reply, { emailId: mail._id, text: 'Hi' }),
  ).rejects.toThrow('Email not found.')
  await asAda.action(api.api.emails.reply, {
    emailId: mail._id,
    text: 'Sure, noon?',
  })
  expect(sent).toEqual([replyTo('bob@example.org', 'Sure, noon?')])
})

test('spam from your own address is shown, not drafted', async () => {
  const { poll, chat, inbox } = await setup()
  received = [email('m1', 'ada@example.com', 'Click here', { spam: true })]
  await poll()

  expect(sent).toEqual([])
  expect(calls).toHaveLength(0)
  expect(await chat('Matilda')).toEqual([
    '📨 **Ada <ada@example.com>** _(marked as spam)_\n**Today**\n\nClick here',
  ])
  expect(await inbox('Matilda')).toMatchObject([{ draft: '' }])
})

test('mail to an address nobody claimed is ignored', async () => {
  const { poll, chat, statuses } = await setup()
  received = [
    email('m1', 'ada@example.com', 'Hi', { to: 'eve@mail.example.com' }),
    email('m2', 'ada@example.com', 'Hi', { to: 'ada@other.example.com' }),
  ]
  await poll()

  expect(sent).toEqual([])
  expect(await chat('Matilda')).toBeNull()
  expect(await statuses()).toEqual(['ignored', 'ignored'])
})

test("a reply that can't be sent says so, and can be sent again", async () => {
  const { asAda, poll, inbox } = await setup()
  received = [email('m1', 'ada@example.com', 'What is on today?')]
  await poll()
  const [mail] = await inbox('Matilda')

  sendStatus = 502
  await expect(
    asAda.action(api.api.emails.reply, { emailId: mail._id, text: 'Hi' }),
  ).rejects.toThrow('Photon 502')
  expect(await inbox('Matilda')).toMatchObject([{ repliedAt: null }])
})

test('past 5 emails at once, yours are posted but not drafted', async () => {
  const { poll, chat, statuses } = await setup()
  received = Array.from({ length: 6 }, (_, i) =>
    email(`m${i}`, 'ada@example.com', `Question ${i}`),
  )
  await poll()

  expect(sent).toEqual([])
  expect(calls).toHaveLength(5)
  expect((await chat('Matilda'))?.slice(-2)).toEqual([
    'Today\n\nQuestion 5',
    '_No draft for this one: too many emails in a short time. You can still reply._',
  ])
  expect(await statuses()).toEqual([
    'answered',
    'answered',
    'answered',
    'answered',
    'answered',
    'limited',
  ])
})

test("find_emails searches your earlier emails, not anyone else's", async () => {
  const { t, poll } = await setup()
  received = [
    email('m1', 'bob@example.org', 'Lunch on Friday at the noodle place?'),
    email('m2', 'ada@example.com', 'Remind me about the noodle order'),
    email('m3', 'carol@example.org', 'Invoice attached'),
  ]
  await poll()
  const ada = (await t.run((ctx) => ctx.db.query('users').first()))!._id
  const eve = await t.run((ctx) => ctx.db.insert('users', {}))
  const search = (userId: typeof ada, query: string, from?: string) =>
    t.query(internal.api.emails.search, { userId, query, from })

  expect((await search(ada, 'noodle')).map((e) => e.from).sort()).toEqual([
    'ada@example.com',
    'bob@example.org',
  ])
  expect(await search(ada, 'noodle', 'Bob@Example.org')).toMatchObject([
    {
      from: 'bob@example.org',
      subject: 'Today',
      text: 'Today\n\nLunch on Friday at the noodle place?',
      replied: false,
    },
  ])
  expect(await search(eve, 'noodle')).toEqual([])
})

test('nothing is checked until Photon is set up', async () => {
  const { poll } = await setup()
  vi.stubEnv('PHOTON_API_KEY', '')
  await poll()
  expect(photonFetch).not.toHaveBeenCalled()
})
