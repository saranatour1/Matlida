import { Resend } from '@convex-dev/resend'
import { z } from 'zod'
import { components } from '../_generated/api'
import { env } from '../_generated/server'

/** Sends through the Resend component's durable outbox, with its retries. Used for assistant mail. */
export const resend = new Resend(components.resend, {
  apiKey: env.RESEND_API_KEY,
  testMode: false,
})

/** What Resend's receiving API returns, loosely: the fields the pipeline reads. */
const zReceivedEmail = z.looseObject({
  id: z.string(),
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string().nullish(),
  text: z.string().nullish(),
  /** Computed by the receiving server, so the sender can't forge them. Null on old mail. */
  authentication: z
    .object({ spf: z.string(), dkim: z.string(), dmarc: z.string() })
    .nullish(),
  message_id: z.string().nullish(),
  headers: z.record(z.string(), z.unknown()).nullish(),
})

export type ReceivedEmail = {
  from: string
  to: Array<string>
  subject: string
  /** The plain-text part. The HTML part and attachments are never read. */
  text: string | null
  authentication: { spf: string; dkim: string; dmarc: string } | null
  messageId: string | null
  /** The message's References header, for threading the reply. */
  references: string | null
}

/**
 * Fetches a received email from Resend by the id the webhook carried. Inline
 * images stay as `cid:` references, so the response stays small.
 */
export async function fetchReceived(emailId: string): Promise<ReceivedEmail> {
  const response = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}?html_format=cid`,
    { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } },
  )
  if (!response.ok) {
    throw new Error(`Resend returned ${response.status} for email ${emailId}`)
  }
  const parsed = zReceivedEmail.safeParse(await response.json())
  if (!parsed.success) {
    throw new Error(`Resend returned an unexpected shape for email ${emailId}`)
  }
  const { from, to, subject, text, authentication, message_id, headers } =
    parsed.data
  const references = headers?.references
  return {
    from,
    to,
    subject: subject ?? '',
    text: text ?? null,
    authentication: authentication ?? null,
    messageId: message_id ?? null,
    references: typeof references === 'string' ? references : null,
  }
}
