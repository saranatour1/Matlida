import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Every email Photon has passed on, by its message id, so each is handled
 * once. Records the outcome, never the message: the text lives in the chat.
 */
export const emailsTable = defineTable({
  /** Photon's message id. */
  messageId: v.string(),
  /** When Photon received it, in ms. The next check asks for mail after the newest. */
  receivedAt: v.number(),
  /**
   * `answering` then `answered` or `failed`: from the mailbox owner, replied to.
   * `limited`: from the owner, but over the limit on answers, so only posted.
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
})
  .index('by_messageId', ['messageId'])
  .index('by_receivedAt', ['receivedAt'])
