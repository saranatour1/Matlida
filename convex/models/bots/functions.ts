import { zid } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import {
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import { getOwnedProject } from '../projects/functions'
import type { Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'

export const MAX_BOTS = 20

/** A project's bots, at most `MAX_BOTS`. */
export async function getBots(
  ctx: Pick<QueryCtx, 'db'>,
  projectId: Id<'projects'>,
) {
  return await ctx.db
    .query('bots')
    .withIndex('by_project_and_name', (q) => q.eq('projectId', projectId))
    .take(MAX_BOTS)
}

const list = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await getBots(ctx, projectId)
  },
})

/** Your bots in other projects, to copy as templates. */
const fromOtherProjects = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_owner', (q) => q.eq('ownerId', ctx.userId))
      .take(50)
    const others = projects.filter((p) => p._id !== projectId)
    const bots = await Promise.all(
      others.map(async (p) =>
        (await getBots(ctx, p._id)).map((b) => ({ ...b, projectName: p.name })),
      ),
    )
    return bots.flat()
  },
})

/** Adds a bot to a project, or updates one when `id` is given. */
const save = zAuthedMutation({
  args: {
    projectId: zid('projects'),
    id: zid('bots').optional(),
    name: z
      .string()
      .trim()
      .min(1, 'Give the bot a name.')
      .max(40, 'Names can be at most 40 characters.'),
    role: z
      .string()
      .trim()
      .min(1, 'Give the bot a role.')
      .max(80, 'Roles can be at most 80 characters.'),
    instructions: z
      .string()
      .trim()
      .min(1, 'Describe what the bot does.')
      .max(2000, 'Descriptions can be at most 2000 characters.'),
  },
  handler: async (ctx, { projectId, id, ...bot }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    const bots = await getBots(ctx, projectId)
    if (id && !bots.some((b) => b._id === id)) {
      throw new ConvexError('Bot not found.')
    }
    if (bots.some((b) => b.name === bot.name && b._id !== id)) {
      throw new ConvexError(`There's already a bot named ${bot.name}.`)
    }
    if (id) {
      await ctx.db.patch('bots', id, bot)
      return id
    }
    if (bots.length >= MAX_BOTS) {
      throw new ConvexError(`A project can have at most ${MAX_BOTS} bots.`)
    }
    return await ctx.db.insert('bots', { projectId, ...bot })
  },
})

const remove = authedMutation({
  args: { id: v.id('bots') },
  handler: async (ctx, { id }) => {
    const bot = await ctx.db.get('bots', id)
    if (!bot) throw new ConvexError('Bot not found.')
    await getOwnedProject(ctx, ctx.userId, bot.projectId)
    await ctx.db.delete('bots', id)
  },
})

export const botsApi = { list, fromOtherProjects, save, remove }
