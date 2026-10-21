import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * A user's assistant address, `handle@MAIL_DOMAIN`. One per user, pointing at
 * the workspace whose assistants answer it. Only the user's verified sign-in
 * email is ever written to or accepted from.
 */
export const mailboxesTable = defineTable({
  userId: v.id('users'),
  /** The workspace whose assistants answer this address. */
  projectId: v.id('projects'),
  /** Lowercase, 3 to 32 of `a-z0-9._-`, checked by `parseHandle`. Unique. */
  handle: v.string(),
  /** The chat where the owner's emails are answered, started on the first one. */
  threadId: v.optional(v.string()),
  /** The chat where everyone else's emails are posted, unanswered. */
  inboxThreadId: v.optional(v.string()),
})
  .index('by_user', ['userId'])
  .index('by_handle', ['handle'])

/** The last DMARC lookup for the mail domain: its raw `_dmarc` TXT records, read with `parseDmarc`. */
export const domainChecksTable = defineTable({
  domain: v.string(),
  records: v.array(v.string()),
  checkedAt: v.number(),
}).index('by_domain', ['domain'])
