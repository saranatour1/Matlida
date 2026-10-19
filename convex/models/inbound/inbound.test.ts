import agentTest from '@convex-dev/agent/test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import workflowTest from '@convex-dev/workflow/test'
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import { languageModel } from '../../lib/ai'
import { signSvix } from '../../lib/svix'
import schema from '../../schema'
import { modules } from '../../test.setup'
import type { TestConvex } from 'convex-test'

vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  return {
    languageModel: mockModel({
      content: [{ type: 'text', text: 'Hi from Matilda.' }],
    }),
  }
})

/** Every email the app asked Resend to send. Only the owner may ever appear in `to`. */
const sent = vi.hoisted(() => [] as Array<Record<string, unknown>>)

vi.mock('@convex-dev/resend', () => ({
  Resend: class {
    sendEmail(_ctx: unknown, options: Record<string, unknown>) {
      sent.push(options)
      return Promise.resolve(`email_${sent.length}`)
    }
  },
}))

const calls = (languageModel as unknown as { doGenerateCalls: Array<unknown> })
  .doGenerateCalls

const SECRET = `whsec_${btoa('an-inbound-webhook-secret')}`
const OWNER = 'ada@example.com'
const ADDRESS = 'ada@mail.example.com'

type Received = {
  id: string
  from: string
  to: Array<string>
  cc?: Array<string>
  subject: string
  text: string | null
  authentication: { spf: string; dkim: string; dmarc: string } | null
  message_id: string | null
  headers: Record<string, string>
}

/** What Resend's receiving API returns for each email id the tests deliver. */
const received = new Map<string, Received>()

function email(overrides: Partial<Received> & { id: string }): Received {
  return {
    from: OWNER,
    to: [ADDRESS],
    subject: 'Plan my week',
    text: 'Can you plan my week?',
    authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
    message_id: `<${overrides.id}@example.com>`,
    headers: {},
    ...overrides,
  }
}

let deliveries = 0

/** Posts a Resend webhook the way Svix signs it. */
async function deliver(
  t: TestConvex<typeof schema>,
  event: unknown,
  overrides: Partial<{
    secret: string
    timestamp: number
    headers: boolean
  }> = {},
) {
  const body = new TextEncoder().encode(JSON.stringify(event))
  const id = `msg_${++deliveries}`
  const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (overrides.headers !== false) {
    headers['svix-id'] = id
    headers['svix-timestamp'] = String(timestamp)
    headers['svix-signature'] = await signSvix({
      body,
      id,
      timestamp,
      secret: overrides.secret ?? SECRET,
    })
  }
  return await t.fetch('/resend/inbound', { method: 'POST', headers, body })
}

afterEach(() => {
  expect(sent.every((s) => s.to === OWNER)).toBe(true)
  sent.length = 0
  calls.length = 0
  received.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

async function setup() {
  vi.useFakeTimers()
  vi.stubEnv('MAIL_DOMAIN', 'mail.example.com')
  vi.stubEnv('RESEND_API_KEY', 're_test')
  vi.stubEnv('RESEND_WEBHOOK_SECRET', SECRET)
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const match = /\/emails\/receiving\/([^?]+)/.exec(String(input))
    const found = match && received.get(decodeURIComponent(match[1]))
    return Promise.resolve(
      found ? Response.json(found) : new Response('not found', { status: 404 }),
    )
  })
  const t = convexTest(schema, modules)
  agentTest.register(t)
  workflowTest.register(t)
  rateLimiterTest.register(t)
  const ada = await t.run(
    async (ctx) => await ctx.db.insert('users', { email: OWNER }),
  )
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  await asAda.mutation(api.api.mailboxes.claim, { projectId, handle: 'ada' })
  /**
   * Runs every scheduled function, advancing fake time only to the next
   * timer, so the workpool's minute-long monitors don't fast-forward the
   * clock (and refill rate limits) between steps.
   */
  const settle = async () =>
    await t.finishAllScheduledFunctions(
      () => vi.advanceTimersToNextTimer(),
      2000,
    )
  /** Delivers `mail` through the webhook and runs the pipeline to the end. */
  const receive = async (mail: Received, drain = true) => {
    received.set(mail.id, mail)
    const response = await deliver(t, {
      type: 'email.received',
      created_at: new Date().toISOString(),
      data: {
        email_id: mail.id,
        from: mail.from,
        to: mail.to,
        subject: mail.subject,
        message_id: mail.message_id,
      },
    })
    if (drain) await settle()
    return response
  }
  const rows = async () =>
    await t.run(
      async (ctx) => await ctx.db.query('inboundEmails').order('asc').take(20),
    )
  return { t, asAda, projectId, receive, rows, settle }
}

test('the owner’s authenticated email gets a reply from the lead, threaded, in its own chat', async () => {
  const { asAda, projectId, receive, rows } = await setup()
  const response = await receive(
    email({ id: 'em_1', headers: { references: '<m0@example.com>' } }),
  )
  expect(response.status).toBe(200)
  expect(await rows()).toMatchObject([
    { emailId: 'em_1', status: 'answered', replyId: 'email_1' },
  ])
  expect(sent).toEqual([
    {
      from: `"Matilda" <${ADDRESS}>`,
      to: OWNER,
      subject: 'Re: Plan my week',
      text: 'Hi from Matilda.',
      headers: [
        { name: 'Auto-Submitted', value: 'auto-replied' },
        { name: 'In-Reply-To', value: '<em_1@example.com>' },
        { name: 'References', value: '<m0@example.com> <em_1@example.com>' },
      ],
      idempotencyKey: 'inbound:em_1',
    },
  ])
  expect(JSON.stringify(calls)).toContain('You are replying by email')
  expect(JSON.stringify(calls)).toContain('Subject: Plan my week')
  const [chat] = await asAda.query(api.api.threads.list, {
    projectId,
    kind: 'chat',
  })
  expect(chat).toMatchObject({ title: 'Matilda · Email' })
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId: chat.threadId,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page.map((m) => m.text).sort()).toEqual([
    'Hi from Matilda.',
    'Subject: Plan my week\n\nCan you plan my week?',
  ])
})

test('bad, old or missing signatures and malformed bodies are refused', async () => {
  const { t, rows } = await setup()
  const event = { type: 'email.received', data: { email_id: 'em_x' } }
  expect(
    (await deliver(t, event, { secret: `whsec_${btoa('another')}` })).status,
  ).toBe(401)
  const stale = Math.floor(Date.now() / 1000) - 600
  expect((await deliver(t, event, { timestamp: stale })).status).toBe(401)
  expect((await deliver(t, event, { headers: false })).status).toBe(400)
  const notJson = await t.fetch('/resend/inbound', {
    method: 'POST',
    headers: {
      'svix-id': 'msg_j',
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': await signSvix({
        body: new TextEncoder().encode('nope'),
        id: 'msg_j',
        timestamp: Math.floor(Date.now() / 1000),
        secret: SECRET,
      }),
    },
    body: 'nope',
  })
  expect(notJson.status).toBe(400)
  expect((await deliver(t, { type: 'email.received', data: {} })).status).toBe(
    400,
  )
  expect((await deliver(t, { type: 'email.sent', data: {} })).status).toBe(200)
  expect(await rows()).toEqual([])
  expect(sent).toEqual([])

  vi.stubEnv('RESEND_WEBHOOK_SECRET', '')
  expect((await deliver(t, event)).status).toBe(500)
})

test('a redelivery, by email id or by Message-ID, is handled once', async () => {
  const { receive, rows } = await setup()
  const first = email({ id: 'em_1' })
  await receive(first)
  await receive(first)
  await receive(email({ id: 'em_2', message_id: first.message_id }))
  expect(await rows()).toMatchObject([{ emailId: 'em_1', status: 'answered' }])
  expect(sent).toHaveLength(1)
})

test('spoofed senders are rejected with a reason and get no reply', async () => {
  const { receive, rows } = await setup()
  await receive(email({ id: 'em_from', from: 'mallory@example.com' }))
  await receive(
    email({ id: 'em_name', from: `${OWNER} <mallory@evil.example>` }),
  )
  await receive(
    email({
      id: 'em_dmarc',
      authentication: { spf: 'pass', dkim: 'pass', dmarc: 'fail' },
    }),
  )
  await receive(
    email({
      id: 'em_dkim',
      authentication: { spf: 'pass', dkim: 'gray', dmarc: 'pass' },
    }),
  )
  await receive(email({ id: 'em_none', authentication: null }))
  await receive(
    email({
      id: 'em_auto',
      headers: { 'auto-submitted': 'auto-replied' },
    }),
  )
  // Mail to a handle nobody claimed is dropped at the webhook, before any fetch.
  await receive(email({ id: 'em_nobody', to: ['nobody@mail.example.com'] }))
  expect(await rows()).toMatchObject([
    { emailId: 'em_from', status: 'rejected', reason: 'from_mismatch' },
    { emailId: 'em_name', status: 'rejected', reason: 'from_mismatch' },
    { emailId: 'em_dmarc', status: 'rejected', reason: 'dmarc_fail' },
    { emailId: 'em_dkim', status: 'rejected', reason: 'dkim_unaligned' },
    { emailId: 'em_none', status: 'rejected', reason: 'no_auth_results' },
    { emailId: 'em_auto', status: 'rejected', reason: 'auto_submitted' },
  ])
  expect(sent).toEqual([])
  expect(calls).toEqual([])
})

test('an owner at a domain with no DMARC policy (p=none, like Gmail) is still accepted when DKIM aligns', async () => {
  const { receive, rows } = await setup()
  await receive(
    email({
      id: 'em_gmail',
      authentication: { spf: 'pass', dkim: 'pass', dmarc: 'gray' },
    }),
  )
  await receive(
    email({
      id: 'em_unsigned',
      authentication: { spf: 'pass', dkim: 'gray', dmarc: 'gray' },
    }),
  )
  expect(await rows()).toMatchObject([
    { emailId: 'em_gmail', status: 'answered' },
    { emailId: 'em_unsigned', status: 'rejected', reason: 'dkim_unaligned' },
  ])
  expect(sent).toHaveLength(1)
})

test('an email to two people’s assistants is answered by the sender’s own', async () => {
  const { t, receive, rows } = await setup()
  const bob = await t.run(
    async (ctx) => await ctx.db.insert('users', { email: 'bob@example.com' }),
  )
  const asBob = t.withIdentity({ subject: bob })
  const bobProject = await asBob.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  await asBob.mutation(api.api.mailboxes.claim, {
    projectId: bobProject,
    handle: 'bob',
  })
  await receive(
    email({
      id: 'em_both',
      to: ['bob@mail.example.com'],
      cc: [ADDRESS],
    }),
  )
  expect(await rows()).toMatchObject([
    { emailId: 'em_both', status: 'answered' },
  ])
  expect(sent).toMatchObject([{ to: OWNER, from: `"Matilda" <${ADDRESS}>` }])
})

test('a message already answered under another Resend id is a duplicate at verification', async () => {
  const { t, rows } = await setup()
  const [first, again] = await t.run(async (ctx) => [
    await ctx.db.insert('inboundEmails', {
      emailId: 'em_a',
      messageId: '<same@example.com>',
      status: 'answered',
    }),
    await ctx.db.insert('inboundEmails', {
      emailId: 'em_b',
      status: 'received',
    }),
  ])
  expect(first).toBeTruthy()
  expect(
    await t.mutation(internal.api.inbound.verify, {
      id: again,
      from: OWNER,
      to: [ADDRESS],
      cc: [],
      authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
      messageId: '<same@example.com>',
      autoSubmitted: false,
    }),
  ).toBeNull()
  expect((await rows()).map((r) => [r.emailId, r.status, r.reason])).toEqual([
    ['em_a', 'answered', undefined],
    ['em_b', 'rejected', 'duplicate'],
  ])
})

test('@name in the subject or first line picks a bot, and sticks', async () => {
  const { asAda, projectId, receive } = await setup()
  await asAda.mutation(api.api.bots.save, {
    projectId,
    name: 'Ivy',
    role: 'Researcher',
    instructions: 'You dig into questions.',
  })
  await receive(email({ id: 'em_1', subject: '@Ivy find a cafe' }))
  await receive(email({ id: 'em_2', subject: 'one with wifi' }))
  await receive(email({ id: 'em_3', subject: 'back', text: '@Matilda thanks' }))
  // In a thread whose subject still carries @Ivy, the first line decides.
  await receive(
    email({
      id: 'em_5',
      subject: 'Re: @Ivy find a cafe',
      text: '@Matilda you?',
    }),
  )
  await receive(email({ id: 'em_4', subject: '@Bob hi' }))
  expect(sent.map((s) => [s.from, s.subject, s.text])).toEqual([
    [`"Ivy" <${ADDRESS}>`, 'Re: @Ivy find a cafe', 'Hi from Matilda.'],
    [`"Ivy" <${ADDRESS}>`, 'Re: one with wifi', 'Hi from Matilda.'],
    [`"Matilda" <${ADDRESS}>`, 'Re: back', 'Hi from Matilda.'],
    [`"Matilda" <${ADDRESS}>`, 'Re: @Ivy find a cafe', 'Hi from Matilda.'],
    [
      `"Matilda" <${ADDRESS}>`,
      'Re: @Bob hi',
      "There's no one by that name here. You can email Matilda, Ivy: start the subject or the first line with @name.",
    ],
  ])
  expect(JSON.stringify(calls)).toContain('Subject: find a cafe')
  expect(JSON.stringify(calls)).not.toContain('@Matilda')
  const chats = await asAda.query(api.api.threads.list, {
    projectId,
    kind: 'chat',
  })
  expect(chats.map((c) => c.title).sort()).toEqual([
    'Ivy · Email',
    'Matilda · Email',
  ])
})

test('only the plain-text part is read, quoted history is cut, and HTML-only mail gets a fixed reply', async () => {
  const { receive } = await setup()
  await receive(
    email({
      id: 'em_1',
      text: 'New question\n\nOn Mon, Matilda wrote:\n> Earlier reply with secrets',
    }),
  )
  expect(JSON.stringify(calls)).toContain('New question')
  expect(JSON.stringify(calls)).not.toContain('Earlier reply')
  calls.length = 0
  await receive(email({ id: 'em_2', text: null }))
  expect(sent[1]).toMatchObject({
    text: "I can only read the plain-text part of an email, and this one didn't have one. Send it again as plain text.",
  })
  expect(calls).toEqual([])
})

test('an owner who sends a burst is rate limited at verification, so nothing is answered', async () => {
  // The verify step is where the limit applies, and it runs without the
  // workpool's timers, which would otherwise move fake time and refill it.
  const { t, rows } = await setup()
  const ids = await t.run(async (ctx) => {
    const inserted = []
    for (let i = 1; i <= 6; i++) {
      inserted.push(
        await ctx.db.insert('inboundEmails', {
          emailId: `em_${i}`,
          status: 'received',
        }),
      )
    }
    return inserted
  })
  const results = []
  for (const id of ids) {
    results.push(
      await t.mutation(internal.api.inbound.verify, {
        id,
        from: OWNER,
        to: [ADDRESS],
        cc: [],
        authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
        messageId: null,
        autoSubmitted: false,
      }),
    )
  }
  expect(results.slice(0, 5).every((r) => r !== null)).toBe(true)
  expect(results[5]).toBeNull()
  expect((await rows()).map((r) => [r.status, r.reason])).toEqual([
    ['received', undefined],
    ['received', undefined],
    ['received', undefined],
    ['received', undefined],
    ['received', undefined],
    ['rejected', 'rate_limited'],
  ])
  expect(sent).toEqual([])
})
