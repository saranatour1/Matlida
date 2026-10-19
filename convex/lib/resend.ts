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
  cc: z.array(z.string()).nullish(),
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
  cc: Array<string>
  subject: string
  /** The plain-text part. The HTML part and attachments are never read. */
  text: string | null
  authentication: { spf: string; dkim: string; dmarc: string } | null
  messageId: string | null
  /** The message's References header, for threading the reply. */
  references: string | null
  /** Sent by a machine (an out-of-office, a bounce, a list), per RFC 3834 and the usual headers. Never answered. */
  autoSubmitted: boolean
}

/** Whether the headers say a machine sent this, so a reply would only start a loop. */
export function isAutoSubmitted(headers: Record<string, unknown>) {
  const text = (name: string) => {
    const value = headers[name]
    return typeof value === 'string' ? value.trim().toLowerCase() : null
  }
  const auto = text('auto-submitted')
  if (auto && auto !== 'no') return true
  if (text('x-auto-response-suppress') !== null) return true
  if (text('x-autoreply') !== null || text('x-autorespond') !== null)
    return true
  const precedence = text('precedence')
  return (
    precedence === 'bulk' ||
    precedence === 'junk' ||
    precedence === 'auto_reply' ||
    precedence === 'list'
  )
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
  const { from, to, cc, subject, text, authentication, message_id, headers } =
    parsed.data
  const references = headers?.references
  return {
    from,
    to,
    cc: cc ?? [],
    subject: subject ?? '',
    text: text ?? null,
    authentication: authentication ?? null,
    // A Message-ID is at most one header line.
    messageId: message_id ? message_id.slice(0, 998) : null,
    references: typeof references === 'string' ? references : null,
    autoSubmitted: isAutoSubmitted(headers ?? {}),
  }
}
