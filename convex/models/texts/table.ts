import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * A Telegram chat linked to a project over Photon. It
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
      /** The app, as Photon names it. Telegram now; imessage, whatsapp_business or unset on old links, which no longer get messages. */
      platform: v.optional(v.string()),
      /** Unused: texts go to Matilda's one chat. Kept for links made before. */
      threadId: v.optional(v.string()),
      /** Unused, like `threadId`. */
      botThreads: v.optional(
        v.array(v.object({ botId: v.id('bots'), threadId: v.string() })),
      ),
      /** Unused: `@name` no longer switches to a bot. */
      activeBotId: v.optional(v.id('bots')),
      /** The project's agent in this chat on Photon's platform API, which texts go out as. Unset on old links. */
      agentId: v.optional(v.string()),
    }),
  ),
)
  .index('by_project', ['projectId'])
  .index('by_code', ['code'])
  .index('by_spaceId', ['spaceId'])

/** Until when the fast Telegram check keeps running. One row, kept fresh while a chat is active. */
export const telegramPollsTable = defineTable({ until: v.number() })

/** What you texted the lead from a linked chat, for `find_texts`. Link codes aren't kept. */
export const receivedTextsTable = defineTable({
  userId: v.id('users'),
  projectId: v.id('projects'),
  /** The app, as Photon names it: telegram. */
  platform: v.string(),
  text: v.string(),
}).searchIndex('search_text', {
  searchField: 'text',
  filterFields: ['userId'],
})

/** Messages that came in through `/photon/webhook`, by Photon's id, so each is answered once. */
export const photonMessagesTable = defineTable({
  messageId: v.string(),
}).index('by_messageId', ['messageId'])
