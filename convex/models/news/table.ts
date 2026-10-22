import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** The news you follow, set up from the chat's setup card. One per user. */
export const newsSettingsTable = defineTable({
  userId: v.id('users'),
  /** The workspace whose lead posts the daily briefing. */
  projectId: v.id('projects'),
  topics: v.array(v.string()),
  regions: v.array(v.string()),
  /** What to leave out, like celebrity gossip. */
  avoid: v.optional(v.string()),
  /** How many stories per topic. */
  perTopic: v.number(),
  /** The hour, 0 to 23 in `timeZone`, to post a briefing each day. Unset means only when asked. */
  dailyHour: v.optional(v.number()),
  timeZone: v.optional(v.string()),
  /** The last day a daily briefing went out, as YYYY-MM-DD in `timeZone`. */
  lastSentDay: v.optional(v.string()),
})
  .index('by_user', ['userId'])
  .index('by_dailyHour', ['dailyHour'])
