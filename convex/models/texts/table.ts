import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * A chat on iMessage, WhatsApp or Telegram linked to a project over Photon. It
 * starts `pending` with a one-time code; sending `link <code>` from the chat
 * makes it `linked` to that chat's Photon space. A project has one link per app.
 */
export const phoneLinksTable = defineTable(
  v.union(
    v.object({
      status: v.literal('pending'),
      ownerId: v.id('users'),
      projectId: v.id('projects'),
      code: v.string(),
    }),
    v.object({
      status: v.literal('linked'),
      ownerId: v.id('users'),
      projectId: v.id('projects'),
      spaceId: v.string(),
      /** The app, as Photon names it: imessage, telegram or whatsapp_business. Unset on early iMessage links. */
      platform: v.optional(v.string()),
      /** The lead's chat for this link, started on the first message. */
      threadId: v.optional(v.string()),
      /** Each bot's chat for this link, started when it's first messaged. */
      botThreads: v.optional(
        v.array(v.object({ botId: v.id('bots'), threadId: v.string() })),
      ),
      /** Who messages go to, picked with `@name`. Unset means the lead. */
      activeBotId: v.optional(v.id('bots')),
      /**
       * The project's agent in this chat on Photon's platform API. Set for
       * chats linked through `/photon/webhook`; their texts go out through
       * that API instead of the Spectrum SDK.
       */
      agentId: v.optional(v.string()),
    }),
  ),
)
  .index('by_project', ['projectId'])
  .index('by_code', ['code'])
  .index('by_spaceId', ['spaceId'])

/** Until when the fast Telegram check keeps running. One row, kept fresh while a chat is active. */
export const telegramPollsTable = defineTable({ until: v.number() })

/** Messages that came in through `/photon/webhook`, by Photon's id, so each is answered once. */
export const photonMessagesTable = defineTable({
  messageId: v.string(),
}).index('by_messageId', ['messageId'])
