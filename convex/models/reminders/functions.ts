import { saveMessage } from '@convex-dev/agent'
import { ConvexError, v } from 'convex/values'
import { components, internal } from '../../_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import { authedMutation, authedQuery } from '../../lib/functions'
import schema from '../../schema'
import { getOwnedProject } from '../projects/functions'
import { getLink } from '../texts/functions'
import { spectrum } from '../texts/spectrum'
import { remindersTable } from './table'

const YEAR_MS = 366 * 24 * 60 * 60 * 1000

/** Saves a reminder and schedules it. For assistants' `set_reminder` tool. */
const schedule = internalMutation({
  args: remindersTable.validator.pick(
    'projectId',
    'threadId',
    'from',
    'message',
    'dueAt',
    'via',
  ),
  returns: v.id('reminders'),
  handler: async (ctx, reminder) => {
    const now = Date.now()
    if (reminder.dueAt < now - 60_000) {
      throw new Error('That time has already passed.')
    }
    if (reminder.dueAt > now + YEAR_MS) {
      throw new Error('Reminders can be at most a year out.')
    }
    const id = await ctx.db.insert('reminders', {
      ...reminder,
      status: 'scheduled',
    })
    const scheduledId = await ctx.scheduler.runAt(
      reminder.dueAt,
      internal.api.reminders.fire,
      { id },
    )
    await ctx.db.patch('reminders', id, { scheduledId })
    return id
  },
})

/** Upcoming reminders, soonest first. */
const list = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await ctx.db
      .query('reminders')
      .withIndex('by_project_and_status', (q) =>
        q.eq('projectId', projectId).eq('status', 'scheduled'),
      )
      .take(50)
  },
})

const cancel = authedMutation({
  args: { id: v.id('reminders') },
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (!reminder) throw new ConvexError('Reminder not found.')
    await getOwnedProject(ctx, ctx.userId, reminder.projectId)
    if (reminder.status !== 'scheduled') return
    if (reminder.scheduledId) await ctx.scheduler.cancel(reminder.scheduledId)
    await ctx.db.patch('reminders', id, { status: 'cancelled' })
  },
})

const delivery = internalQuery({
  args: { id: v.id('reminders') },
  returns: v.union(
    v.object({
      reminder: schema.doc('reminders'),
      spaceId: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (reminder?.status !== 'scheduled') return null
    const project = await ctx.db.get('projects', reminder.projectId)
    if (!project) return null
    const link = await getLink(ctx, project._id)
    return {
      reminder,
      spaceId: link?.status === 'linked' ? link.spaceId : null,
    }
  },
})

/** Marks the reminder sent and posts it in its chat. Idempotent, so a retried `fire` posts once. */
const markSent = internalMutation({
  args: { id: v.id('reminders'), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, note }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (reminder?.status !== 'scheduled') return null
    await ctx.db.patch('reminders', id, { status: 'sent', note })
    await saveMessage(ctx, components.agent, {
      threadId: reminder.threadId,
      message: {
        role: 'assistant',
        content: `⏰ **Reminder:** ${reminder.message}${note ? `\n\n_${note}_` : ''}`,
      },
    })
    return null
  },
})

/** Delivers a due reminder: a text when asked for, and always a chat message. */
const fire = internalAction({
  args: { id: v.id('reminders') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const found = await ctx.runQuery(internal.api.reminders.delivery, { id })
    if (!found) return null
    const { reminder, spaceId } = found
    let note: string | undefined
    if (reminder.via === 'text') {
      if (spaceId) {
        await spectrum.send(ctx, {
          spaceId,
          content: {
            type: 'text',
            text: `Reminder from ${reminder.from}: ${reminder.message}`,
          },
        })
      } else {
        note = "Texting isn't linked, so it's only here."
      }
    }
    await ctx.runMutation(internal.api.reminders.markSent, { id, note })
    return null
  },
})

export const remindersApi = {
  schedule,
  list,
  cancel,
  delivery,
  markSent,
  fire,
}
