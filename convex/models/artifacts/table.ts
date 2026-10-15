import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** Documents a lead saves with the save_artifact tool. */
export const artifactsTable = defineTable({
  projectId: v.id('projects'),
  threadId: v.string(),
  title: v.string(),
  /** Markdown. */
  content: v.string(),
}).index('by_project', ['projectId'])
