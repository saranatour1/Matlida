import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** A video an assistant made, or is making in the background. The file is in Convex storage. */
export const videosTable = defineTable({
  projectId: v.id('projects'),
  /** The chat that asked for it. */
  threadId: v.string(),
  prompt: v.string(),
  shape: literals('wide', 'tall'),
  status: literals('working', 'done', 'failed'),
  storageId: v.optional(v.id('_storage')),
  error: v.optional(v.string()),
}).index('by_threadId', ['threadId'])
