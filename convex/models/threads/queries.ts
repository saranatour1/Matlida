import { getBots } from '../bots/queries'
import type { Db, Doc, Id } from '../../lib/ctx'

/** The thread when `userId` owns its project, otherwise null. */
export const getOwnedThread = async (
  ctx: Db,
  userId: Id<'users'>,
  threadId: string,
) => {
  const thread = await ctx.db
    .query('threads')
    .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
    .unique()
  const project = thread && (await ctx.db.get('projects', thread.projectId))
  return project?.ownerId === userId ? thread : null
}

/** An assistant's one thread, as recorded on it: the bot's, or the lead's when `bot` is null. Null before its first message. */
export const getMainThread = (
  project: Doc<'projects'>,
  bot: Doc<'bots'> | null,
) => (bot ? bot.threadId : project.threadId) ?? null

/** The bots in a thread, who its assistant can hand work to. None until you add them. */
export const getMembers = async (ctx: Db, thread: Doc<'threads'> | null) => {
  if (!thread?.memberIds?.length) return []
  const bots = await getBots(ctx, thread.projectId)
  return bots.filter((b) => thread.memberIds?.includes(b._id))
}
