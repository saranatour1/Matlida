import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const projectsTable = defineTable({
  ownerId: v.id('users'),
  /** The project's lead goes by this name too. */
  name: v.string(),
  /** What the project is about. Only the lead sees it. */
  brief: v.string(),
  /** Rules the lead and every employee always follow. */
  guidelines: v.optional(v.string()),
  /** The owner's AI connection. Unset means the Convex AI Gateway. */
  aiConnectionId: v.optional(v.id('aiConnections')),
  /** Overrides the connection's default model. */
  model: v.optional(v.string()),
}).index('by_owner', ['ownerId'])
