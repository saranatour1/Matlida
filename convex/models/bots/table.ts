import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { vPortrait } from '../../lib/portraits'

/** A bot the user made for a project. The project's lead can hand it work. */
export const botsTable = defineTable({
  projectId: v.id('projects'),
  name: v.string(),
  role: v.string(),
  /** What the bot does and how it thinks. It becomes the bot's system prompt. */
  instructions: v.string(),
  /** The gateway model it runs on. Unset means the app's default. */
  model: v.optional(v.string()),
  /** The bot's one thread: the app, Telegram and calls all talk there. */
  threadId: v.optional(v.string()),
  /** How hard it works on a reply. Unset means medium. */
  effort: v.optional(
    v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
  ),
  portrait: v.optional(vPortrait),
}).index('by_project_and_name', ['projectId', 'name'])
