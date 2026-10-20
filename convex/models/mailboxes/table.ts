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
})
  .index('by_user', ['userId'])
  .index('by_handle', ['handle'])
