import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** A checklist an assistant drew up in a chat. It shows in the Library. */
export const plansTable = defineTable({
  projectId: v.id('projects'),
  title: v.string(),
  steps: v.array(v.object({ text: v.string(), done: v.boolean() })),
  /** The chat that made it. */
  threadId: v.string(),
}).index('by_project', ['projectId'])
