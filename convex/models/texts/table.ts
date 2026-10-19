import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * A phone linked to a project's lead over Photon. It starts `pending` with a
 * one-time code; texting `link <code>` from the phone makes it `linked` to that
 * phone's Photon space.
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
      /** The project's "Texts" chat, started on the first message. */
      threadId: v.optional(v.string()),
    }),
  ),
)
  .index('by_project', ['projectId'])
  .index('by_code', ['code'])
  .index('by_spaceId', ['spaceId'])
