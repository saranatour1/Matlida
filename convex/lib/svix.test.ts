import { expect, test } from 'vitest'
import { signSvix, verifySvix } from './svix'

const secret = 'whsec_' + btoa('a-test-secret-of-decent-length')
const body = new TextEncoder().encode('{"type":"email.received"}')
const now = 1_760_000_000_000
const timestamp = Math.floor(now / 1000)

async function headers(
  overrides: Partial<{ id: string; timestamp: number; secret: string }> = {},
) {
  const id = overrides.id ?? 'msg_1'
  const ts = overrides.timestamp ?? timestamp
  return {
    id,
    timestamp: String(ts),
    signature: await signSvix({
      body,
      id,
      timestamp: ts,
      secret: overrides.secret ?? secret,
    }),
  }
}

test('a fresh, correctly signed delivery passes', async () => {
  expect(
    await verifySvix({ body, headers: await headers(), secret, now }),
  ).toEqual({ ok: true })
})

test('any signature in the list may match, and others are ignored', async () => {
  const good = await headers()
  const signature = `v1,${btoa('nope')} v0,xx ${good.signature}`
  expect(
    await verifySvix({ body, headers: { ...good, signature }, secret, now }),
  ).toEqual({ ok: true })
})

test('a wrong secret, a changed body or a bad base64 entry is a mismatch', async () => {
  const forged = await headers({ secret: 'whsec_' + btoa('another-secret') })
  expect(await verifySvix({ body, headers: forged, secret, now })).toEqual({
    ok: false,
    reason: 'mismatch',
  })
  const good = await headers()
  const other = new TextEncoder().encode('{"type":"email.received","x":1}')
  expect(await verifySvix({ body: other, headers: good, secret, now })).toEqual(
    { ok: false, reason: 'mismatch' },
  )
  expect(
    await verifySvix({
      body,
      headers: { ...good, signature: 'v1,!!!' },
      secret,
      now,
    }),
  ).toEqual({ ok: false, reason: 'mismatch' })
})

test('an old or future timestamp is stale, even with a valid signature', async () => {
  const old = await headers({ timestamp: timestamp - 301 })
  expect(await verifySvix({ body, headers: old, secret, now })).toEqual({
    ok: false,
    reason: 'stale',
  })
  const future = await headers({ timestamp: timestamp + 301 })
  expect(await verifySvix({ body, headers: future, secret, now })).toEqual({
    ok: false,
    reason: 'stale',
  })
  const edge = await headers({ timestamp: timestamp - 300 })
  expect(await verifySvix({ body, headers: edge, secret, now })).toEqual({
    ok: true,
  })
})

test('missing or malformed headers are refused before any crypto', async () => {
  const good = await headers()
  for (const broken of [
    { ...good, id: null },
    { ...good, timestamp: null },
    { ...good, signature: null },
    { ...good, timestamp: 'soon' },
  ]) {
    expect(await verifySvix({ body, headers: broken, secret, now })).toEqual({
      ok: false,
      reason: 'missing_headers',
    })
  }
})
