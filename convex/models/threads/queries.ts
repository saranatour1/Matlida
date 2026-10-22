import { getThreadMetadata } from '@convex-dev/agent'
import { components } from '../../_generated/api'
import { getBots } from '../bots/queries'
import type { Db, Doc, Id, QueryCtx } from '../../lib/ctx'

/** Whether `userId` may read `threadId`: every thread is made for its workspace's owner. */
export const ownsThread = async (
  ctx: Pick<QueryCtx, 'runQuery'>,
  userId: Id<'users'>,
  threadId: string,
) => {
  const thread = await getThreadMetadata(ctx, components.agent, {
    threadId,
  }).catch(() => null)
  return thread?.userId === userId
}

/** Who answers in `threadId`: the project and, for a bot's chat, the bot. Null when it's no assistant's chat. */
export const assistantOf = async (ctx: Db, threadId: string) => {
  const project = await ctx.db
    .query('projects')
    .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
    .unique()
  if (project) return { project, bot: null }
  const bot = await ctx.db
    .query('bots')
    .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
    .unique()
  const owner = bot && (await ctx.db.get('projects', bot.projectId))
  return owner && { project: owner, bot }
}

/** An assistant's one thread, as recorded on it: the bot's, or the lead's when `bot` is null. Null before its first message. */
export const getMainThread = (
  project: Doc<'projects'>,
  bot: Doc<'bots'> | null,
) => (bot ? bot.threadId : project.threadId) ?? null

/** The bots an assistant can hand work to: the bot's, or the lead's when `bot` is null. None until you add them. */
export const getMembers = async (
  ctx: Db,
  project: Doc<'projects'>,
  bot: Doc<'bots'> | null,
) => {
  const ids = (bot ?? project).memberIds
  if (!ids?.length) return []
  const bots = await getBots(ctx, project._id)
  return bots.filter((b) => ids.includes(b._id) && b._id !== bot?._id)
}
