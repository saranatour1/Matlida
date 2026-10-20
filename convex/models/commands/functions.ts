import { zid } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { generateObject } from 'ai'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import { internalMutation, internalQuery } from '../../_generated/server'
import { languageModel } from '../../lib/ai'
import { BUILT_IN_COMMANDS } from '../../lib/commands'
import { authedMutation, authedQuery, zAuthedAction } from '../../lib/functions'
import { removeComments } from '../comments/functions'
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

/** The project's own command called `name`, or null. */
export async function getCommand(
  ctx: Pick<QueryCtx, 'db'>,
  projectId: Id<'projects'>,
  name: string,
) {
  return await ctx.db
    .query('commands')
    .withIndex('by_project_and_name', (q) =>
      q.eq('projectId', projectId).eq('name', name),
    )
    .unique()
}

/**
 * The name of the command a message runs when it starts with `/name`, or
 * null for a plain message: one of the project's, or a built-in. Throws a
 * user-facing error when there's no such command.
 */
export async function findCommand(
  ctx: Pick<QueryCtx, 'db'>,
  projectId: Id<'projects'>,
  prompt: string,
) {
  const name = /^\/([a-z0-9][a-z0-9-]*)(?:\s|$)/i
    .exec(prompt)?.[1]
    ?.toLowerCase()
  if (!name) return null
  if (
    (await getCommand(ctx, projectId, name)) ||
    BUILT_IN_COMMANDS.some((c) => c.name === name)
  ) {
    return name
  }
  throw new ConvexError(`There's no /${name} command.`)
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
    await removeComments(ctx, command.projectId, 'command', id)
    await ctx.db.delete('commands', id)
    await ctx.storage.delete(command.storageId)
  },
})

/** The project's command names, once its owner is checked. For `draft`. */
const names = internalQuery({
  args: { projectId: v.id('projects'), userId: v.id('users') },
  returns: v.array(v.string()),
  handler: async (ctx, { projectId, userId }) => {
    await getOwnedProject(ctx, userId, projectId)
    return [
      ...(await getCommands(ctx, projectId)).map((c) => c.name),
      ...BUILT_IN_COMMANDS.map((c) => c.name),
    ]
  },
})

const zDraft = z.object({
  name: z
    .string()
    .describe(
      'A short slug: lowercase letters, numbers and dashes, like weekly-update.',
    ),
  description: z
    .string()
    .describe('One line saying what it does, under 120 characters.'),
  markdown: z
    .string()
    .describe(
      'The instructions the assistant follows when the command runs, in markdown: the goal, the steps, the output format, and which tools to use (web_search, research, save_plan, run_plan, set_reminder). Write to the assistant, in the second person.',
    ),
})

/**
 * Writes a command from what the user wants it to do, for them to check and
 * save. Nothing is saved here. The name is made unique in the project.
 */
const draft = zAuthedAction({
  args: {
    projectId: zid('projects'),
    idea: z
      .string()
      .trim()
      .min(3, 'Say what the command should do.')
      .max(2000, 'Keep the idea under 2000 characters.'),
  },
  handler: async (
    ctx,
    { projectId, idea },
  ): Promise<z.infer<typeof zDraft>> => {
    const taken: Array<string> = await ctx.runQuery(
      internal.api.commands.names,
      { projectId, userId: ctx.userId },
    )
    const { object } = await generateObject({
      model: languageModel,
      schema: zDraft,
      system:
        'You write slash commands for an AI assistant app. A command is a reusable prompt the user runs as /name, optionally followed by details. Make it specific, short and practical.',
      prompt: `The user wants a command that: ${idea}\n\nExisting command names: ${taken.join(', ') || 'none'}.`,
    })
    let name =
      object.name
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 28) || 'command'
    for (let n = 2; taken.includes(name); n++) {
      name = `${name.replace(/-\d+$/, '')}-${n}`
    }
    return {
      name,
      description: object.description.trim().slice(0, 200),
      markdown: object.markdown.trim(),
    }
  },
})

export const commandsApi = { list, get, save, write, remove, names, draft }
