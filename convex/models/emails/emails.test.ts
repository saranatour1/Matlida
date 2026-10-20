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
  return { poll, chat, statuses }
}

test('your own email is answered by email, to you only, in its thread', async () => {
  const { poll, chat, statuses } = await setup()
  received = [
    email(
      'm1',
      'Ada@Example.com',
      'What is on today?\n\nOn Mon, Bob wrote:\n> old news',
    ),
  ]
  await poll()

  expect(sent).toEqual([
    {
      headers: expect.objectContaining({
        'idempotency-key': 'matilda-reply:m1',
      }) as unknown,
      body: {
        spaceId: 'space-1',
        senderId: 'agent-user',
        parentMessageId: 'm1',
        content: { type: 'text', format: 'plain', text: 'Hi from Matilda.' },
        email: { to: [{ address: 'ada@example.com' }] },
      },
    },
  ])
  expect(JSON.stringify(calls)).toContain('You are replying by email')
  expect(await chat('Matilda · Email')).toEqual([
    'Today\n\nWhat is on today?',
    'Hi from Matilda.',
  ])
  expect(await statuses()).toEqual(['answered'])

  // The next check sees the same email again and leaves it.
  await poll()
  expect(sent).toHaveLength(1)
})

test("someone else's email shows in your inbox chat and isn't answered", async () => {
  const { poll, chat, statuses } = await setup()
  received = [email('m1', 'bob@example.org', 'Lunch?', { name: 'Bob' })]
  await poll()

  expect(sent).toEqual([])
  expect(calls).toHaveLength(0)
  expect(await chat('Email inbox')).toEqual([
    '📨 **Bob <bob@example.org>**\n**Today**\n\nLunch?',
  ])
  expect(await chat('Matilda · Email')).toBeNull()
  expect(await statuses()).toEqual(['shown'])
})

test('spam from your own address is shown, not answered', async () => {
  const { poll, chat } = await setup()
  received = [email('m1', 'ada@example.com', 'Click here', { spam: true })]
  await poll()

  expect(sent).toEqual([])
  expect(calls).toHaveLength(0)
  expect(await chat('Email inbox')).toEqual([
    '📨 **Ada <ada@example.com>** _(marked as spam)_\n**Today**\n\nClick here',
  ])
})

test('mail to an address nobody claimed is ignored', async () => {
  const { poll, chat, statuses } = await setup()
  received = [
    email('m1', 'ada@example.com', 'Hi', { to: 'eve@mail.example.com' }),
    email('m2', 'ada@example.com', 'Hi', { to: 'ada@other.example.com' }),
  ]
  await poll()

  expect(sent).toEqual([])
  expect(await chat('Email inbox')).toBeNull()
  expect(await statuses()).toEqual(['ignored', 'ignored'])
})

test("a reply that can't be sent says so in the chat", async () => {
  const { poll, chat, statuses } = await setup()
  sendStatus = 502
  vi.spyOn(console, 'error').mockImplementation(() => {})
  received = [email('m1', 'ada@example.com', 'What is on today?')]
  await poll()

  expect(await chat('Matilda · Email')).toEqual([
    'Today\n\nWhat is on today?',
    'Hi from Matilda.',
    "_This reply couldn't be sent by email._",
  ])
  expect(await statuses()).toEqual(['failed'])
})

test('past 5 emails at once, yours are posted but not answered', async () => {
  const { poll, chat, statuses } = await setup()
  received = Array.from({ length: 6 }, (_, i) =>
    email(`m${i}`, 'ada@example.com', `Question ${i}`),
  )
  await poll()

  expect(sent).toHaveLength(5)
  expect((await chat('Matilda · Email'))?.slice(-2)).toEqual([
    'Today\n\nQuestion 5',
    '_Not answered by email: too many emails in a short time. Try again in a few minutes._',
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

test('nothing is checked until Photon is set up', async () => {
  const { poll } = await setup()
  vi.stubEnv('PHOTON_API_KEY', '')
  await poll()
  expect(photonFetch).not.toHaveBeenCalled()
})
