import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * A note the user left on an instruction text: the workspace guidelines, a
 * bot's instructions or a command. It quotes the passage it's about, so the
 * editor can find and highlight it in the markdown as it stands, and the
 * markdown itself stays clean for the assistants.
 */
export const commentsTable = defineTable({
  projectId: v.id('projects'),
  kind: literals('project', 'bot', 'command'),
  /** The bot's or command's id, or the project's own id for its guidelines. */
  targetId: v.string(),
  /** The passage the note is about, as the user selected it. */
  quote: v.string(),
  text: v.string(),
  resolved: v.boolean(),
}).index('by_target', ['projectId', 'kind', 'targetId'])
