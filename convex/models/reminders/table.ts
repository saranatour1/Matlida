import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** Something an assistant promised to bring up later, in the chat and by text or call. */
export const remindersTable = defineTable({
  projectId: v.id('projects'),
  /** The chat it was set in. The reminder posts there when it fires. */
  threadId: v.string(),
  /** Who set it, for the message and the call. */
  from: v.string(),
  message: v.string(),
  dueAt: v.number(),
  via: literals('chat', 'text', 'call'),
  status: literals('scheduled', 'sent', 'cancelled'),
  /** What happened on delivery, e.g. that calls weren't set up and it texted instead. */
  note: v.optional(v.string()),
  scheduledId: v.optional(v.id('_scheduled_functions')),
}).index('by_project_and_status', ['projectId', 'status', 'dueAt'])
