import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const projectsTable = defineTable({
  ownerId: v.id('users'),
  /** The project's lead goes by this name too. */
  name: v.string(),
  /** What the project is about. Only the lead sees it. */
  brief: v.string(),
  /** Rules the lead and every bot always follow. */
  guidelines: v.optional(v.string()),
}).index('by_owner', ['ownerId'])
