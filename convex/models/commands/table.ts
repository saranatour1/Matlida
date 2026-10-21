import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** A command the user can run in a chat as `/name`. */
export const commandsTable = defineTable({
  projectId: v.id('projects'),
  /** A slug, like `standup`. */
  name: v.string(),
  description: v.string(),
  /** The command's markdown, stored as a file in Convex storage. */
  storageId: v.id('_storage'),
  /** SHA-256 of the markdown, so saving the same thing again changes nothing. Unset on commands from before. */
  hash: v.optional(v.string()),
})
  .index('by_project_and_name', ['projectId', 'name'])
  .index('by_storageId', ['storageId'])
