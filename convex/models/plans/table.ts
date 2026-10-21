import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * A checklist an assistant drew up in a chat: a plan, or a list like To-do or
 * Shopping list that keeps growing. It shows in the chat and the Library.
 */
export const plansTable = defineTable({
  projectId: v.id('projects'),
  title: v.string(),
  steps: v.array(
    v.object({
      text: v.string(),
      done: v.boolean(),
      /** A heading to group it under, like an aisle on a shopping list. */
      section: v.optional(v.string()),
    }),
  ),
  /** The chat that made it. */
  threadId: v.string(),
}).index('by_project', ['projectId'])
