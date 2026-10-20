import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** Someone the assistants can reach for the user, like "Luke". Saved by the assistants when the user gives the details. */
export const contactsTable = defineTable({
  projectId: v.id('projects'),
  name: v.string(),
  /** The name lowercased, to find them by what the user calls them. */
  key: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  note: v.optional(v.string()),
}).index('by_project_and_key', ['projectId', 'key'])
