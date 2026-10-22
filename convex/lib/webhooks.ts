/**
 * Verifies a Standard Webhooks delivery (the Svix scheme, which Photon's
 * `whsec_` secrets follow). The signed content is `${id}.${timestamp}.${body}`,
 * signed with HMAC-SHA256 under the secret (`whsec_` plus base64) and sent as
 * `v1,<base64>` entries in the signature header. Headers are read as
 * `webhook-*` or `svix-*`. A delivery more than 5 minutes off is refused, so a
 * captured request can't be replayed later. Web Crypto only.
 */

const TOLERANCE_SECONDS = 300

export type WebhookCheck =
  | { ok: true; id: string }
  | { ok: false; reason: 'missing_headers' | 'stale' | 'mismatch' }

const decodeBase64 = (text: string) => {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const hmacKey = async (secret: string, use: 'sign' | 'verify') => {
  const raw = decodeBase64(
    secret.startsWith('whsec_') ? secret.slice(6) : secret,
  )
  return await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [use],
  )
}

const signedContent = (
  id: string,
  timestamp: string,
  body: Uint8Array<ArrayBuffer>,
) => {
  const prefix = new TextEncoder().encode(`${id}.${timestamp}.`)
  const signed = new Uint8Array(prefix.length + body.length)
  signed.set(prefix, 0)
  signed.set(body, prefix.length)
  return signed
}

export const verifyWebhook = async ({
  body,
  headers,
  secret,
  now = Date.now(),
}: {
  body: Uint8Array<ArrayBuffer>
  headers: Headers
  secret: string
  now?: number
}): Promise<WebhookCheck> => {
  const header = (name: string) =>
    headers.get(`webhook-${name}`) ?? headers.get(`svix-${name}`)
  const id = header('id')
  const timestamp = header('timestamp')
  const signature = header('signature')
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) {
    return { ok: false, reason: 'missing_headers' }
  }
  if (
    Math.abs(Math.floor(now / 1000) - Number(timestamp)) > TOLERANCE_SECONDS
  ) {
    return { ok: false, reason: 'stale' }
  }
  const key = await hmacKey(secret, 'verify')
  const signed = signedContent(id, timestamp, body)
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
      return { ok: true, id }
    }
  }
  return { ok: false, reason: 'mismatch' }
}

/** Signs a body the way a Standard Webhooks sender does, for tests. */
export const signWebhook = async ({
  body,
  id,
  timestamp,
  secret,
}: {
  body: Uint8Array<ArrayBuffer>
  id: string
  timestamp: number
  secret: string
}) => {
  const key = await hmacKey(secret, 'sign')
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      signedContent(id, String(timestamp), body),
    ),
  )
  return `v1,${btoa(String.fromCharCode(...mac))}`
}
