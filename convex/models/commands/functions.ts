import { zid } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import { authedMutation, authedQuery, zAuthedAction } from '../../lib/functions'
import { getOwnedProject } from '../projects/functions'
import type { Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'

export const MAX_COMMANDS = 50

/** A project's commands, at most `MAX_COMMANDS`. */
export async function getCommands(
  ctx: Pick<QueryCtx, 'db'>,
  projectId: Id<'projects'>,
) {
  return await ctx.db
    .query('commands')
    .withIndex('by_project_and_name', (q) => q.eq('projectId', projectId))
    .take(MAX_COMMANDS)
}

const list = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await getCommands(ctx, projectId)
  },
})

/** A command and a URL to its markdown, for editing. */
const get = authedQuery({
  args: { id: v.id('commands') },
  handler: async (ctx, { id }) => {
    const command = await ctx.db.get('commands', id)
    if (!command) return null
    await getOwnedProject(ctx, ctx.userId, command.projectId)
    return { ...command, url: await ctx.storage.getUrl(command.storageId) }
  },
})

const commandArgs = {
  projectId: zid('projects'),
  id: zid('commands').optional(),
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9-]{0,31}$/,
      'Use up to 32 letters, numbers and dashes, like standup.',
    ),
  description: z
    .string()
    .trim()
    .min(1, 'Say what the command does.')
    .max(200, 'Descriptions can be at most 200 characters.'),
}

/** Stores the command's markdown in Convex storage, then saves the command. */
const save = zAuthedAction({
  args: {
    ...commandArgs,
    markdown: z
      .string()
      .trim()
      .min(1, 'Write what the command should do.')
      .max(20_000, 'Commands can be at most 20,000 characters.'),
  },
  handler: async (ctx, { markdown, ...command }): Promise<Id<'commands'>> => {
    const storageId = await ctx.storage.store(
      new Blob([markdown], { type: 'text/markdown' }),
    )
    try {
      return await ctx.runMutation(internal.api.commands.write, {
        ...command,
        userId: ctx.userId,
        storageId,
      })
    } catch (error) {
      await ctx.storage.delete(storageId)
      throw error
    }
  },
})

/** Saves a command whose markdown is already stored, and deletes the file it replaces. */
const write = internalMutation({
  args: {
    projectId: v.id('projects'),
    id: v.optional(v.id('commands')),
    name: v.string(),
    description: v.string(),
    storageId: v.id('_storage'),
    userId: v.id('users'),
  },
  returns: v.id('commands'),
  handler: async (ctx, { projectId, id, userId, ...command }) => {
    await getOwnedProject(ctx, userId, projectId)
    const commands = await getCommands(ctx, projectId)
    const existing = commands.find((c) => c._id === id)
    if (id && !existing) throw new ConvexError('Command not found.')
    if (commands.some((c) => c.name === command.name && c._id !== id)) {
      throw new ConvexError(`There's already a /${command.name} command.`)
    }
    if (existing) {
      await ctx.db.patch('commands', existing._id, command)
      await ctx.storage.delete(existing.storageId)
      return existing._id
    }
    if (commands.length >= MAX_COMMANDS) {
      throw new ConvexError(
        `A project can have at most ${MAX_COMMANDS} commands.`,
      )
    }
    return await ctx.db.insert('commands', { projectId, ...command })
  },
})

const remove = authedMutation({
  args: { id: v.id('commands') },
  handler: async (ctx, { id }) => {
    const command = await ctx.db.get('commands', id)
    if (!command) throw new ConvexError('Command not found.')
    await getOwnedProject(ctx, ctx.userId, command.projectId)
    await ctx.db.delete('commands', id)
    await ctx.storage.delete(command.storageId)
  },
})

export const commandsApi = { list, get, save, write, remove }
