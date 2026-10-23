import { ConvexError } from 'convex/values'
import { BUILT_IN_COMMANDS } from '../../lib/commands'
import type { Db, Id } from '../../lib/ctx'

export const MAX_COMMANDS = 50

/** A project's commands, at most `MAX_COMMANDS`. */
export const getCommands = async (ctx: Db, projectId: Id<'projects'>) => {
  return await ctx.db
    .query('commands')
    .withIndex('by_project_and_name', (q) => q.eq('projectId', projectId))
    .take(MAX_COMMANDS)
}

/** The project's own command called `name`, or null. */
export const getCommand = async (
  ctx: Db,
  projectId: Id<'projects'>,
  name: string,
) => {
  return await ctx.db
    .query('commands')
    .withIndex('by_project_and_name', (q) =>
      q.eq('projectId', projectId).eq('name', name),
    )
    .unique()
}

/** The `/name` a message starts with, lowercased, or null. Telegram's `/name@bot` counts too. */
export const commandName = (prompt: string) =>
  /^\/([a-z0-9][a-z0-9-]*)(?:@\w+)?(?:\s|$)/i
    .exec(prompt)?.[1]
    ?.toLowerCase() ?? null

/** The command called `name`: the project's own, else a built-in, else null. */
export const resolveCommand = async (
  ctx: Db,
  projectId: Id<'projects'>,
  name: string,
) => {
  const stored = await getCommand(ctx, projectId, name)
  if (stored) return { name: stored.name, storageId: stored.storageId }
  const builtIn = BUILT_IN_COMMANDS.find((c) => c.name === name)
  return builtIn ? { name: builtIn.name, markdown: builtIn.markdown } : null
}

/**
 * The name of the command a message runs when it starts with `/name`, or
 * null for a plain message: one of the project's, or a built-in. Throws a
 * user-facing error when there's no such command.
 */
export const findCommand = async (
  ctx: Db,
  projectId: Id<'projects'>,
  prompt: string,
) => {
  const name = commandName(prompt)
  if (!name) return null
  if (await resolveCommand(ctx, projectId, name)) return name
  throw new ConvexError(`There's no /${name} command.`)
}
