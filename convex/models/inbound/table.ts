import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Every email Resend handed us, by its ids only: enough to dedupe redeliveries
 * and to say what happened. Never the message itself; that stays with Resend
 * and, once accepted, in the assistant's thread.
 */
export const inboundEmailsTable = defineTable({
  /** Resend's id for the received email. */
  emailId: v.string(),
  /** The RFC Message-ID header, so a redelivery under a new id is still caught. */
  messageId: v.optional(v.string()),
  status: literals('received', 'rejected', 'answered', 'failed'),
  /** Why it was rejected or failed, as a short code. */
  reason: v.optional(v.string()),
  mailboxId: v.optional(v.id('mailboxes')),
  workflowId: v.optional(v.string()),
  /** The reply's id in the Resend component. */
  replyId: v.optional(v.string()),
})
  .index('by_emailId', ['emailId'])
  .index('by_messageId', ['messageId'])
