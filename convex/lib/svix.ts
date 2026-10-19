/**
 * Verifies a Svix-signed webhook (Resend uses Svix). The signed content is
 * `${svix-id}.${svix-timestamp}.${body}`, signed with HMAC-SHA256 under the
 * endpoint's secret (`whsec_` plus base64), and sent as `v1,<base64>`
 * entries in `svix-signature`. A delivery older or newer than the tolerance
 * is refused, so a captured request can't be replayed later. Web Crypto only,
 * so it runs in Convex's default runtime.
 */

export const SVIX_TOLERANCE_SECONDS = 300

export type SvixHeaders = {
  id: string | null
  timestamp: string | null
  signature: string | null
}

export type SvixOutcome =
  { ok: true } | { ok: false; reason: 'missing_headers' | 'stale' | 'mismatch' }

function decodeBase64(text: string) {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** The raw key from a Svix secret, with or without its `whsec_` prefix. */
export function svixKey(secret: string) {
  return decodeBase64(secret.startsWith('whsec_') ? secret.slice(6) : secret)
}

export async function verifySvix(input: {
  body: Uint8Array<ArrayBuffer>
  headers: SvixHeaders
  secret: string
  now?: number
}): Promise<SvixOutcome> {
  const { body, headers, secret, now = Date.now() } = input
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: 'missing_headers' }
  }
  const seconds = Number(timestamp)
  if (!Number.isInteger(seconds))
    return { ok: false, reason: 'missing_headers' }
  if (Math.abs(Math.floor(now / 1000) - seconds) > SVIX_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'stale' }
  }
  const encoder = new TextEncoder()
  const prefix = encoder.encode(`${id}.${timestamp}.`)
  const signed = new Uint8Array(prefix.length + body.length)
  signed.set(prefix, 0)
  signed.set(body, prefix.length)
  const key = await crypto.subtle.importKey(
    'raw',
    svixKey(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  for (const entry of signature.split(' ')) {
    const [version, value] = entry.split(',')
    if (version !== 'v1' || !value) continue
    let provided: Uint8Array<ArrayBuffer>
    try {
      provided = decodeBase64(value)
    } catch {
      continue
    }
    // subtle.verify compares in constant time.
    if (await crypto.subtle.verify('HMAC', key, provided, signed)) {
      return { ok: true }
    }
  }
  return { ok: false, reason: 'mismatch' }
}

/** Signs a body the way Svix does, for tests and local checks. */
export async function signSvix(input: {
  body: Uint8Array<ArrayBuffer>
  id: string
  timestamp: number
  secret: string
}) {
  const encoder = new TextEncoder()
  const prefix = encoder.encode(`${input.id}.${input.timestamp}.`)
  const signed = new Uint8Array(prefix.length + input.body.length)
  signed.set(prefix, 0)
  signed.set(input.body, prefix.length)
  const key = await crypto.subtle.importKey(
    'raw',
    svixKey(input.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed))
  return `v1,${btoa(String.fromCharCode(...mac))}`
}
