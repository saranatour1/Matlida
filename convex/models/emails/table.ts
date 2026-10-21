import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Every email Photon has passed on, by its message id, so each is handled
 * once. The text lives in the chat; this keeps what replying needs.
 */
export const emailsTable = defineTable({
  /** Photon's message id. */
  messageId: v.string(),
  /** When Photon received it, in ms. The next check asks for mail after the newest. */
  receivedAt: v.number(),
  /**
   * `answering` then `answered` or `failed`: from the mailbox owner, Matilda's draft written.
   * `limited`: from the owner, but over the limit on drafts, so only posted.
   * `shown`: from anyone else, posted in the owner's inbox chat.
   * `ignored`: no one has claimed the address.
   */
  status: literals(
    'answering',
    'answered',
    'failed',
    'limited',
    'shown',
    'ignored',
  ),
  /** The mailbox owner, who can reply. Unset on ignored mail and mail from before replies. */
  userId: v.optional(v.id('users')),
  /** The chat it was posted in, and its message there, which gets the Reply button. */
  threadId: v.optional(v.string()),
  chatMessageId: v.optional(v.string()),
  /** The sender's address, where a reply goes. */
  from: v.optional(v.string()),
  subject: v.optional(v.string()),
  /** Photon's email thread and the mailbox's Photon user, which a reply is sent in and from. */
  spaceId: v.optional(v.string()),
  mailboxUserId: v.optional(v.string()),
  /** Matilda's suggested reply, which the Reply box starts with. */
  draft: v.optional(v.string()),
  /** When you replied. One reply per email. */
  repliedAt: v.optional(v.number()),
})
  .index('by_messageId', ['messageId'])
  .index('by_receivedAt', ['receivedAt'])
  .index('by_threadId', ['threadId'])
