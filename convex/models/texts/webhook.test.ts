import agentTest from '@convex-dev/agent/test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import { signWebhook } from '../../lib/webhooks'
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

const SECRET = `whsec_${btoa('photon-test-secret')}`

/** Every text sent through Photon's API: chat, sender, text, idempotency key. */
const sent: Array<{
  spaceId: string
  senderId: string
  text: string
  key: string
}> = []

/** What Photon's message list returns to the Telegram check. */
let listed: Array<unknown> = []

beforeEach(() => {
  vi.useFakeTimers()
  sent.length = 0
  listed = []
  vi.stubEnv('PHOTON_PROJECT_ID', 'pho_prj_test')
  vi.stubEnv('PHOTON_API_KEY', 'pho_sk_test')
  vi.stubEnv('PHOTON_WEBHOOK_SECRET', SECRET)
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') {
        expect(url).toMatch(
          /^https:\/\/api\.photon\.codes\/v1\/projects\/pho_prj_test\/messages\?platform=telegram&direction=received/,
        )
        return Promise.resolve(Response.json({ items: listed }))
      }
      expect(url).toBe(
        'https://api.photon.codes/v1/projects/pho_prj_test/messages',
      )
      const body = JSON.parse(init.body as string) as {
        spaceId: string
        senderId: string
        content: { text: string }
      }
      sent.push({
        spaceId: body.spaceId,
        senderId: body.senderId,
        text: body.content.text,
        key: (init.headers as Record<string, string>)['idempotency-key'],
      })
      return Promise.resolve(Response.json({ id: 'sent' }))
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function setup() {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  rateLimiterTest.register(t)
  const ada = await t.run((ctx) => ctx.db.insert('users', {}))
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })

  /** Delivers a Telegram text the way Photon does, signed unless told otherwise. */
  const deliver = async (
    id: string,
    text: string,
    { secret = SECRET, at = Date.now() }: { secret?: string; at?: number } = {},
  ) => {
    const body = new TextEncoder().encode(
      JSON.stringify({
        id: `evt_${id}`,
        type: 'message.received',
        apiVersion: '2026-07-01',
        source: 'telegram.photon',
        timestamp: new Date(at).toISOString(),
        data: {
          projectId: 'pho_prj_test',
          object: {
            id,
            platform: 'telegram',
            status: 'received',
            content: { type: 'text', text },
            sentBy: { id: 'user-ada', kind: 'human' },
            receivedBy: { id: 'agent-bot', kind: 'agent' },
            space: { id: 'tg-chat-1', kind: 'direct' },
          },
        },
      }),
    )
    const timestamp = Math.floor(at / 1000)
    const response = await t.fetch('/photon/webhook', {
      method: 'POST',
      headers: {
        'webhook-id': `msg_${id}`,
        'webhook-timestamp': String(timestamp),
        'webhook-signature': await signWebhook({
          body,
          id: `msg_${id}`,
          timestamp,
          secret,
        }),
      },
      body,
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    return response.status
  }
  return { t, asAda, projectId, deliver }
}

test('an unlinked Telegram chat is told how to link, through Photon', async () => {
  const { deliver } = await setup()
  expect(await deliver('m1', 'hello?')).toBe(200)
  expect(sent).toEqual([
    {
      spaceId: 'tg-chat-1',
      senderId: 'agent-bot',
      text: "This chat isn't linked yet. Open Messaging in Matilda and send me the code it shows.",
      key: 'reply:m1',
    },
  ])
})

test('linking from Telegram, then chatting, then a text reminder, all go through Photon', async () => {
  const { t, asAda, projectId, deliver } = await setup()
  const code = await asAda.mutation(api.api.texts.startLink, { projectId })
  await deliver('m1', `link ${code}`)
  expect(await asAda.query(api.api.texts.links, { projectId })).toMatchObject([
    {
      status: 'linked',
      spaceId: 'tg-chat-1',
      platform: 'telegram',
      agentId: 'agent-bot',
    },
  ])

  await deliver('m2', 'What is on today?')
  expect(sent.at(-1)).toEqual({
    spaceId: 'tg-chat-1',
    senderId: 'agent-bot',
    text: 'Hi from Matilda.',
    key: 'reply:m2',
  })

  const [chat] = await asAda.query(api.api.threads.list, {
    projectId,
    kind: 'chat',
  })
  const id = await t.mutation(internal.api.reminders.schedule, {
    projectId,
    threadId: chat.threadId,
    from: 'Matilda',
    message: 'Call the bank',
    dueAt: Date.now() + 60_000,
    via: 'text',
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(sent.at(-1)).toEqual({
    spaceId: 'tg-chat-1',
    senderId: 'agent-bot',
    text: 'Reminder from Matilda: Call the bank',
    key: `reminder:${id}`,
  })
})

test('Photon delivering the same message twice gets one answer', async () => {
  const { deliver } = await setup()
  await deliver('m1', 'hello?')
  await deliver('m1', 'hello?')
  expect(sent).toHaveLength(1)
})

test('forged, stale or unsigned deliveries are refused and never answered', async () => {
  const { t, deliver } = await setup()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(
    await deliver('m1', 'hello?', { secret: `whsec_${btoa('wrong')}` }),
  ).toBe(401)
  expect(await deliver('m2', 'hello?', { at: Date.now() - 10 * 60_000 })).toBe(
    401,
  )
  const unsigned = await t.fetch('/photon/webhook', {
    method: 'POST',
    body: '{}',
  })
  expect(unsigned.status).toBe(400)
  expect(sent).toEqual([])
  expect(await t.run((ctx) => ctx.db.query('photonMessages').take(10))).toEqual(
    [],
  )
})

test('the minute check answers a Telegram text the webhook never delivered, once', async () => {
  const { t } = await setup()
  listed = [
    {
      id: 'm1',
      platform: 'telegram',
      status: 'received',
      content: { type: 'text', text: 'hello?' },
      receivedBy: { id: 'agent-bot' },
      space: { id: 'tg-chat-1' },
    },
    { id: 'm2', content: { type: 'attachment' }, space: { id: 'tg-chat-1' } },
  ]
  await t.action(internal.api.texts.poll, {})
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  await t.action(internal.api.texts.poll, {})
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(sent).toEqual([
    {
      spaceId: 'tg-chat-1',
      senderId: 'agent-bot',
      text: "This chat isn't linked yet. Open Messaging in Matilda and send me the code it shows.",
      key: 'reply:m1',
    },
  ])
})
