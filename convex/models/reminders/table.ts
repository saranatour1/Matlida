import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Something an assistant promised to bring up later: in the chat, by text, by
 * email, or by ringing you in the app. Or a message to one of your contacts,
 * which waits (`pending`) until you confirm it.
 */
export const remindersTable = defineTable({
  projectId: v.id('projects'),
  /** The chat it was set in. The reminder posts there when it fires. */
  threadId: v.string(),
  /** Who set it, for the message and the call. */
  from: v.string(),
  message: v.string(),
  dueAt: v.number(),
  via: literals('chat', 'text', 'call', 'email'),
  /** `ringing` while a call reminder waits for you to pick up. Only a recurring one can be `paused`. */
  status: literals(
    'pending',
    'scheduled',
    'ringing',
    'paused',
    'sent',
    'cancelled',
  ),
  /** For a recurring reminder: how often, and its cron in the owner's time zone. Sent, it goes back to `scheduled`. */
  repeat: v.optional(
    v.object({
      every: literals('daily', 'weekdays', 'weekly', 'monthly', 'custom'),
      cronspec: v.string(),
    }),
  ),
  /** For a message to a contact: who, their name when it was set, and what to tell them. */
  contactId: v.optional(v.id('contacts')),
  toName: v.optional(v.string()),
  say: v.optional(v.string()),
  /** What happened on delivery, e.g. that texting wasn't linked. */
  note: v.optional(v.string()),
  scheduledId: v.optional(v.id('_scheduled_functions')),
  /** Calls you didn't pick up so far. Jev decides on another, up to `MAX_CALLS`. */
  attempts: v.optional(v.number()),
}).index('by_project_and_status', ['projectId', 'status', 'dueAt'])
