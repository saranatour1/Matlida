import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** A voice call with one assistant. It started at `_creationTime`. */
export const callsTable = defineTable({
  projectId: v.id('projects'),
  /** Unset means the project's lead. */
  botId: v.optional(v.id('bots')),
  /** The chat the call's turns land in, once there is one. */
  threadId: v.optional(v.string()),
  endedAt: v.optional(v.number()),
}).index('by_project_and_bot', ['projectId', 'botId'])

/** One thing said on a call, in order. */
export const callLinesTable = defineTable({
  callId: v.id('calls'),
  who: literals('you', 'them'),
  text: v.string(),
  /** For a reply: how long it took, from hearing you to the reply being ready to play. */
  ms: v.optional(v.number()),
}).index('by_call', ['callId'])
