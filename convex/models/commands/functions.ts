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
import type { ActionCtx, QueryCtx } from '../../_generated/server'

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

/** The markdown's SHA-256, in hex. */
async function sha256(text: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}

/**
 * Stores the markdown, then saves the command: `id` edits that command,
 * `replace` replaces the one with the same name, otherwise it's new. Safe to
 * run again: saving what's already saved changes nothing and returns the same
 * command. A file left by a run that stopped before saving is swept later.
 */
export async function saveCommand(
  ctx: ActionCtx,
  {
    markdown,
    ...command
  }: {
    projectId: Id<'projects'>
    userId: Id<'users'>
    id?: Id<'commands'>
    replace?: boolean
    name: string
    description: string
    markdown: string
  },
): Promise<Id<'commands'>> {
  const storageId = await ctx.storage.store(
    new Blob([markdown], { type: 'text/markdown' }),
  )
  try {
    return await ctx.runMutation(internal.api.commands.write, {
      ...command,
      storageId,
      hash: await sha256(markdown),
    })
  } catch (error) {
    await ctx.storage.delete(storageId)
    throw error
  }
}

/** The Library editor's Save, and Save in Create with AI. */
const save = zAuthedAction({
  args: {
    ...commandArgs,
    markdown: z
      .string()
      .trim()
      .min(1, 'Write what the command should do.')
      .max(20_000, 'Commands can be at most 20,000 characters.'),
  },
  handler: async (ctx, command): Promise<Id<'commands'>> =>
    await saveCommand(ctx, { ...command, userId: ctx.userId }),
})

/**
 * Points a command at its newly stored markdown, deciding from what's saved
 * now: when the command already has this name, description and markdown, the
 * new file is dropped and nothing changes. Otherwise it edits `id`, replaces
 * the command named `name` when `replace`, or adds a new one, and deletes the
 * file it replaces. The name is looked up here, in the same transaction, so
 * two saves of one name can't both think it's new.
 */
const write = internalMutation({
  args: {
    projectId: v.id('projects'),
    id: v.optional(v.id('commands')),
    replace: v.optional(v.boolean()),
    name: v.string(),
    description: v.string(),
    storageId: v.id('_storage'),
    hash: v.string(),
    userId: v.id('users'),
  },
  returns: v.id('commands'),
  handler: async (ctx, { projectId, id, replace, userId, ...command }) => {
    await getOwnedProject(ctx, userId, projectId)
    const commands = await getCommands(ctx, projectId)
    const named = commands.find((c) => c.name === command.name)
    const target = id
      ? commands.find((c) => c._id === id)
      : replace
        ? named
        : undefined
    if (id && !target) throw new ConvexError('Command not found.')
    // Already saved, like a retry after a lost response.
    const current = target || named
    if (
      current &&
      current.name === command.name &&
      current.description === command.description &&
      current.hash === command.hash
    ) {
      await ctx.storage.delete(command.storageId)
      return current._id
    }
    if (named && named._id !== target?._id) {
      throw new ConvexError(`There's already a /${command.name} command.`)
    }
    if (target) {
      await ctx.db.patch('commands', target._id, command)
      await ctx.storage.delete(target.storageId)
      return target._id
    }
    if (commands.length >= MAX_COMMANDS) {
      throw new ConvexError(
        `A project can have at most ${MAX_COMMANDS} commands.`,
      )
    }
    return await ctx.db.insert('commands', { projectId, ...command })
  },
})

/** Deletes a command. Deleting one that's already gone does nothing. */
const remove = authedMutation({
  args: { id: v.id('commands') },
  handler: async (ctx, { id }) => {
    const command = await ctx.db.get('commands', id)
    if (!command) return
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

const HOUR = 60 * 60_000

/**
 * Deletes files nothing keeps. Every file kept past an hour is a command's
 * markdown (call audio and recordings are deleted within minutes), so a file
 * from one to two hours ago that no command points to was left by a run that
 * stopped halfway: a command save, a call piece or a recording. Hourly from
 * `crons.ts`; a file it already deleted is simply gone the next time, and a
 * save still running is too new to be looked at. Anything new that keeps
 * files longer has to be checked here too.
 * ponytail: files from an hour the cron missed stay; widen the window if that matters.
 */
/**
 * Whether the sweep may delete a file nothing points to: command markdown
 * and call audio, which are only kept by a row. Pictures, videos and
 * anything else are kept. Files with no type (only in tests) count as left over.
 */
export function sweepable({ contentType }: { contentType?: string }) {
  return (
    !contentType ||
    contentType === 'text/markdown' ||
    contentType.startsWith('audio/')
  )
}

const sweepFiles = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now()
    const files = await ctx.db.system
      .query('_storage')
      .withIndex('by_creation_time', (q) =>
        q
          .gte('_creationTime', now - 2 * HOUR - 10 * 60_000)
          .lt('_creationTime', now - HOUR),
      )
      .take(500)
    let deleted = 0
    for (const file of files) {
      if (!sweepable(file)) continue
      const used = await ctx.db
        .query('commands')
        .withIndex('by_storageId', (q) => q.eq('storageId', file._id))
        .first()
      if (used) continue
      await ctx.storage.delete(file._id)
      deleted++
    }
    return deleted
  },
})

export const commandsApi = {
  list,
  get,
  save,
  write,
  remove,
  names,
  draft,
  sweepFiles,
}
