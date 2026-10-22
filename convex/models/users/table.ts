import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * One row per account, holding the profile from the latest sign-in. Passwords,
 * emails and linked providers live in the auth components.
 */
export const usersTable = defineTable({
  name: v.optional(v.string()),
  /** Only a verified address is stored. */
  email: v.optional(v.string()),
  image: v.optional(v.string()),
  /** The GitHub login, for accounts that use GitHub. */
  username: v.optional(v.string()),
  /** IANA zone from the browser's last message, so calls keep to your daytime. */
  timeZone: v.optional(v.string()),
  /** The assistant you last messaged, and when (to within 10 minutes), for check-in calls. */
  lastChat: v.optional(
    v.object({
      projectId: v.id('projects'),
      botId: v.optional(v.id('bots')),
      at: v.number(),
    }),
  ),
  /** False when you turned off check-in calls. On by default. */
  checkIns: v.optional(v.boolean()),
  /** When an assistant last called to check in. */
  checkInAt: v.optional(v.number()),
}).index('by_lastChat', ['lastChat.at'])
