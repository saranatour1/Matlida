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
  /** The lead's email thread, started on the first email. */
  threadId: v.optional(v.string()),
  /** Each bot's email thread, started when it's first written to. */
  botThreads: v.optional(
    v.array(v.object({ botId: v.id('bots'), threadId: v.string() })),
  ),
  /** Who email goes to, picked with `@name`. Unset means the lead. */
  activeBotId: v.optional(v.id('bots')),
})
  .index('by_user', ['userId'])
  .index('by_handle', ['handle'])
