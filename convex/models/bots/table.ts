import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { vLook } from '../../lib/looks'

/** A bot the user made for a project. The project's lead can hand it work. */
export const botsTable = defineTable({
  projectId: v.id('projects'),
  name: v.string(),
  role: v.string(),
  /** What the bot does and how it thinks. It becomes the bot's system prompt. */
  instructions: v.string(),
  look: v.optional(vLook),
}).index('by_project_and_name', ['projectId', 'name'])
