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
