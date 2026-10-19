import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** What one piece of work cost: a model step, a search, or a reply's action time. */
export const usageTable = defineTable({
  projectId: v.id('projects'),
  /** The chat the user sees it in. A bot's sub-thread work is charged to its parent chat. */
  threadId: v.string(),
  kind: literals('reply', 'search', 'research', 'compute'),
  /** Who or what did it: an assistant's name, a search query. */
  label: v.string(),
  /** AI gateway cost in US dollars. */
  aiCost: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  /** Convex action time, for `compute` rows. */
  computeMs: v.optional(v.number()),
}).index('by_thread', ['threadId'])
