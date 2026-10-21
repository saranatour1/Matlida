import { zid } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { MODEL_ID } from '../../lib/models'
import { zPortrait } from '../../lib/portraits'
import { authedQuery, zAuthedMutation } from '../../lib/functions'
import { internalQuery } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'

/** The project when `userId` owns it. Throws a user-facing error otherwise. */
export async function getOwnedProject(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
  projectId: Id<'projects'>,
) {
  const project = await ctx.db.get('projects', projectId)
  if (project?.ownerId !== userId) throw new ConvexError('Project not found.')
  return project
}

const list = authedQuery({
  args: {},
  handler: async (ctx) =>
    await ctx.db
      .query('projects')
      .withIndex('by_owner', (q) => q.eq('ownerId', ctx.userId))
      .take(50),
})

/** Looks up a project by an id from the URL. Null unless it exists and is yours. */
const get = authedQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const projectId = ctx.db.normalizeId('projects', id)
    const project = projectId && (await ctx.db.get('projects', projectId))
    return project && project.ownerId === ctx.userId ? project : null
  },
})

/** Creates a project, or updates it when `id` is given. */
const save = zAuthedMutation({
  args: {
    id: zid('projects').optional(),
    name: z
      .string()
      .trim()
      .min(1, 'Give the project a name.')
      .max(40, 'Names can be at most 40 characters.'),
    brief: z
      .string()
      .trim()
      .max(2000, 'The brief can be at most 2000 characters.'),
    guidelines: z
      .string()
      .trim()
      .max(8000, 'Guidelines can be at most 8000 characters.'),
    portrait: zPortrait.optional(),
    model: z
      .string()
      .trim()
      .max(80)
      .regex(MODEL_ID, 'Use a gateway model id like anthropic/claude-sonnet-5.')
      .optional(),
    effort: z.enum(['low', 'medium', 'high']).optional(),
  },
  handler: async (ctx, { id, ...project }) => {
    if (id) {
      await getOwnedProject(ctx, ctx.userId, id)
      await ctx.db.patch('projects', id, project)
      return id
    }
    return await ctx.db.insert('projects', { ownerId: ctx.userId, ...project })
  },
})

const DAY = 24 * 60 * 60_000

/**
 * What's on the user's plate, for `get_today`: reminders in the next day,
 * messages and tasks waiting for them, emails from the last three days
 * nobody replied to, and lists with things left to do.
 */
const today = internalQuery({
  args: { projectId: v.id('projects') },
  returns: v.object({
    reminders: v.array(
      v.object({
        message: v.string(),
        dueAt: v.number(),
        via: v.string(),
        to: v.optional(v.string()),
      }),
    ),
    toConfirm: v.number(),
    tasks: v.array(v.object({ title: v.string(), status: v.string() })),
    emails: v.array(
      v.object({
        from: v.string(),
        subject: v.string(),
        receivedAt: v.number(),
      }),
    ),
    lists: v.array(
      v.object({
        planId: v.id('plans'),
        title: v.string(),
        left: v.number(),
        next: v.array(v.string()),
      }),
    ),
  }),
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get('projects', projectId)
    if (!project) throw new Error('No such project.')
    const now = Date.now()
    const reminders = await ctx.db
      .query('reminders')
      .withIndex('by_project_and_status', (q) =>
        q
          .eq('projectId', projectId)
          .eq('status', 'scheduled')
          .lt('dueAt', now + DAY),
      )
      .take(20)
    const toConfirm = await ctx.db
      .query('reminders')
      .withIndex('by_project_and_status', (q) =>
        q.eq('projectId', projectId).eq('status', 'pending'),
      )
      .take(20)
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .order('desc')
      .take(20)
    const emails = await ctx.db
      .query('emails')
      .withIndex('by_receivedAt', (q) => q.gt('receivedAt', now - 3 * DAY))
      .order('desc')
      .take(100)
    const plans = await ctx.db
      .query('plans')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .order('desc')
      .take(30)
    return {
      reminders: reminders.map((r) => ({
        message: r.message,
        dueAt: r.dueAt,
        via: r.via,
        to: r.toName,
      })),
      toConfirm: toConfirm.length,
      tasks: tasks
        .filter((t) => t.status === 'running' || t.status === 'waiting_for_you')
        .map((t) => ({ title: t.title, status: t.status })),
      emails: emails
        .filter(
          (e) =>
            e.userId === project.ownerId &&
            e.from &&
            !e.repliedAt &&
            e.status !== 'ignored',
        )
        .slice(0, 5)
        .map((e) => ({
          from: e.from ?? '',
          subject: e.subject ?? '',
          receivedAt: e.receivedAt,
        })),
      lists: plans
        .map((p) => ({ plan: p, open: p.steps.filter((s) => !s.done) }))
        .filter(({ open }) => open.length > 0)
        .slice(0, 6)
        .map(({ plan, open }) => ({
          planId: plan._id,
          title: plan.title,
          left: open.length,
          next: open.slice(0, 3).map((s) => s.text),
        })),
    }
  },
})

export const projectsApi = { list, get, save, today }
