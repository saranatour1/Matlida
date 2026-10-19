import { zid } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { authedQuery, zAuthedMutation } from '../../lib/functions'
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
      .max(2000, 'Guidelines can be at most 2000 characters.'),
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

export const projectsApi = { list, get, save }
