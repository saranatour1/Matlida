import spectrumTest from '@spectrum-ts/convex/test'
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { components } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

/**
 * `POST /spectrum/webhook` is the Photon component's route. These tests pin
 * down what it does with forged, stale and repeated deliveries, since
 * everything texting does starts there.
 */

const SECRET = 'a-photon-webhook-secret'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Photon's signature: HMAC-SHA256 over `v0:<unix seconds>:<body>`, sent as `v0=<hex>`. */
async function sign(body: string, timestamp: number, secret = SECRET) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`v0:${timestamp}:${body}`),
  )
  const hex = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `v0=${hex}`
}

/** A native Photon delivery of one Telegram text. */
function envelope(messageId: string, text: string) {
  return JSON.stringify({
    event: 'message.received',
    message: {
      id: messageId,
      platform: 'telegram',
      direction: 'inbound',
      timestamp: new Date().toISOString(),
      sender: { id: 'user-1' },
      space: { id: 'tg-1', platform: 'telegram' },
      content: { type: 'text', text },
    },
  })
}

function setup() {
  vi.useFakeTimers()
  vi.stubEnv('SPECTRUM_WEBHOOK_SECRET', SECRET)
  const t = convexTest(schema, modules)
  spectrumTest.register(t)
  const post = async (body: string, headers: Record<string, string> = {}) =>
    await t.fetch('/spectrum/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    })
  const signed = async (
    body: string,
    timestamp = Math.floor(Date.now() / 1000),
    secret = SECRET,
  ) =>
    await post(body, {
      'x-spectrum-timestamp': String(timestamp),
      'x-spectrum-signature': await sign(body, timestamp, secret),
    })
  const inbox = async () =>
    await t.query(components.spectrum.inbound.listMessages, { spaceId: 'tg-1' })
  return { t, post, signed, inbox }
}

test('a forged, stale or unsigned delivery is refused and nothing is stored', async () => {
  const { post, signed, inbox } = setup()
  const body = envelope('tg-msg-1', 'hello')
  expect((await post(body)).status).toBe(400)
  expect((await signed(body, undefined, 'another-secret')).status).toBe(401)
  const now = Math.floor(Date.now() / 1000)
  expect((await signed(body, now - 301)).status).toBe(401)
  expect((await signed(body, now + 301)).status).toBe(401)
  // A valid signature over different bytes doesn't carry over.
  const tampered = await post(envelope('tg-msg-1', 'hello!'), {
    'x-spectrum-timestamp': String(now),
    'x-spectrum-signature': await sign(body, now),
  })
  expect(tampered.status).toBe(401)
  expect(await inbox()).toEqual([])
})

test('without a webhook secret on the deployment, every delivery is refused', async () => {
  const { signed } = setup()
  vi.stubEnv('SPECTRUM_WEBHOOK_SECRET', '')
  expect((await signed(envelope('tg-msg-1', 'hello'))).status).toBe(500)
})

test('a valid delivery is stored once, and a replay of it is acknowledged without a second copy', async () => {
  const { signed, inbox } = setup()
  const body = envelope('tg-msg-1', 'hello')
  expect((await signed(body)).status).toBe(200)
  expect((await signed(body)).status).toBe(200)
  // The same message again under a fresh signature is still the same message.
  expect((await signed(body, Math.floor(Date.now() / 1000) + 10)).status).toBe(
    200,
  )
  expect(await inbox()).toMatchObject([
    {
      messageId: 'tg-msg-1',
      status: 'queued',
      content: { type: 'text', text: 'hello' },
    },
  ])
})
