import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { vPortrait } from '../../lib/portraits'

export const projectsTable = defineTable({
  ownerId: v.id('users'),
  /** The project's lead goes by this name too. */
  name: v.string(),
  /** What the project is about. Only the lead sees it. */
  brief: v.string(),
  /** Rules the lead and every bot always follow. */
  guidelines: v.optional(v.string()),
  /** The lead's portrait. */
  portrait: v.optional(vPortrait),
  /** The gateway model the lead runs on. Unset means the app's default. */
  model: v.optional(v.string()),
  /** The lead's one thread: the app, Telegram, email and calls all talk there. */
  threadId: v.optional(v.string()),
  /** How hard the lead works on a reply. Unset means medium. */
  effort: v.optional(
    v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
  ),
}).index('by_owner', ['ownerId'])
