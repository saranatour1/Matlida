import { z } from 'zod'

/** Photon's platform API (beta), which sends and receives the assistants' email. */
const API = 'https://api.photon.codes/v1'

export type PhotonKeys = { projectId: string; apiKey: string }

const zText = z.object({
  type: z.string(),
  format: z.string().optional(),
  text: z.string().optional(),
})

/** The parts of a received email this app reads. Photon sends more. */
const zEmail = z.object({
  id: z.string(),
  createdAt: z.string(),
  content: zText.extend({
    parts: z.array(zText).optional(),
    metadata: z
      .object({
        email: z.object({ subject: z.string().optional() }).optional(),
      })
      .optional(),
  }),
  metadata: z.object({ isSpam: z.boolean().optional() }).optional(),
  sentBy: z.object({
    handle: z.string(),
    metadata: z.object({ displayName: z.string().optional() }).optional(),
  }),
  receivedBy: z.object({ id: z.string(), handle: z.string() }).optional(),
  space: z.object({ id: z.string() }),
})

export type PhotonEmail = z.infer<typeof zEmail>

const zPage = z.object({
  items: z.array(z.unknown()),
  nextPageToken: z.string().nullish(),
})

async function call(keys: PhotonKeys, path: string, init?: RequestInit) {
  const response = await fetch(`${API}/projects/${keys.projectId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${keys.apiKey}`,
      'content-type': 'application/json',
      ...init?.headers,
    },
  })
  if (!response.ok) {
    // Problem documents carry a code and request id, never message text.
    const problem = (await response.json().catch(() => ({}))) as {
      code?: string
      requestId?: string
    }
    throw new Error(
      `Photon ${response.status} ${problem.code ?? ''} (request ${problem.requestId ?? 'unknown'})`,
    )
  }
  return (await response.json()) as unknown
}

/** Emails received since `since` (ISO), oldest first. Items that aren't emails are skipped. */
export async function listEmails(keys: PhotonKeys, since: string) {
  const emails: Array<PhotonEmail> = []
  let pageToken: string | undefined
  do {
    const query = new URLSearchParams({
      platform: 'email',
      direction: 'received',
      order: 'asc',
      pageSize: '100',
      createdSince: since,
      ...(pageToken ? { pageToken } : {}),
    })
    const page = zPage.parse(await call(keys, `/messages?${query}`))
    for (const item of page.items) {
      const email = zEmail.safeParse(item)
      if (email.success) emails.push(email.data)
    }
    pageToken = page.nextPageToken ?? undefined
  } while (pageToken)
  return emails
}

/** The email's plain-text body: its text, or the plain part of a multipart email. */
export function plainText(content: PhotonEmail['content']) {
  if (content.type === 'text') return content.text ?? ''
  const part = content.parts?.find(
    (p) => p.type === 'text' && p.format === 'plain',
  )
  return part?.text ?? ''
}

const zId = z.object({ id: z.string() })

/** Photon's user for an email address, created on first use. */
async function emailUser(keys: PhotonKeys, address: string) {
  const user = await call(keys, '/users', {
    method: 'POST',
    body: JSON.stringify({ handle: address, platform: 'email' }),
  })
  return zId.parse(user).id
}

/**
 * Sends a text into a Photon space (a Telegram chat, for one) as `senderId`,
 * the project's agent there. `key` makes a retry send once.
 */
export async function sendText(
  keys: PhotonKeys,
  {
    spaceId,
    senderId,
    text,
    key,
  }: { spaceId: string; senderId: string; text: string; key: string },
) {
  await call(keys, '/messages', {
    method: 'POST',
    headers: { 'idempotency-key': key },
    body: JSON.stringify({
      spaceId,
      senderId,
      content: { type: 'text', format: 'plain', text },
    }),
  })
}

/** The Photon keys from the deployment, or null until they're set. */
export function photonKeys(env: {
  PHOTON_PROJECT_ID?: string
  PHOTON_API_KEY?: string
}): PhotonKeys | null {
  return env.PHOTON_PROJECT_ID && env.PHOTON_API_KEY
    ? { projectId: env.PHOTON_PROJECT_ID, apiKey: env.PHOTON_API_KEY }
    : null
}

/**
 * Starts a new email from `from` (an address on the connected domain) to `to`.
 * `key` makes retries safe: the same key reuses the thread and the message.
 */
export async function sendEmail(
  keys: PhotonKeys,
  {
    from,
    to,
    subject,
    text,
    key,
  }: { from: string; to: string; subject: string; text: string; key: string },
) {
  const senderId = await emailUser(keys, from)
  const recipientId = await emailUser(keys, to)
  const space = await call(keys, '/spaces', {
    method: 'POST',
    headers: { 'idempotency-key': key },
    body: JSON.stringify({
      platform: 'email',
      participantIds: [senderId, recipientId],
    }),
  })
  await call(keys, '/messages', {
    method: 'POST',
    headers: { 'idempotency-key': key },
    body: JSON.stringify({
      spaceId: zId.parse(space).id,
      senderId,
      content: { type: 'text', format: 'plain', text },
      email: { subject, to: [{ address: to }] },
    }),
  })
}

/**
 * Replies to `email` in its thread, to `to` only. Photon builds the threading
 * headers from `parentMessageId`; `to` overrides the recipients it would
 * otherwise copy from the email.
 */
export async function replyByEmail(
  keys: PhotonKeys,
  email: PhotonEmail & { receivedBy: { id: string } },
  to: string,
  text: string,
) {
  await call(keys, '/messages', {
    method: 'POST',
    headers: { 'idempotency-key': `matilda-reply:${email.id}` },
    body: JSON.stringify({
      spaceId: email.space.id,
      senderId: email.receivedBy.id,
      parentMessageId: email.id,
      content: { type: 'text', format: 'plain', text },
      email: { to: [{ address: to }] },
    }),
  })
}
