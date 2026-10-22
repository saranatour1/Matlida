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

/**
 * An assistant's one thread: the one recorded on the bot, or the lead's when
 * `bot` is null. Before one is recorded, the chat it used before, found
 * with no caps, so traffic before `recordMainThreads` runs still lands in
 * the old chat. Null when it has never been talked to.
 */
export const getMainThread = async (
  ctx: Db,
  project: Doc<'projects'>,
  bot: Doc<'bots'> | null,
) => {
  const recorded = bot ? bot.threadId : project.threadId
  if (recorded) return recorded
  return await findOldMainThread(
    ctx,
    project,
    bot,
    await getChannelThreads(ctx, project),
  )
}

/**
 * The chat an assistant used before one was recorded: its newest chat that
 * isn't one Telegram, iMessage, WhatsApp or email used to get of their own.
 * Reads every candidate, with no cap, so an old app chat behind many
 * channel chats is still found.
 */
export const findOldMainThread = async (
  ctx: Db,
  project: Doc<'projects'>,
  bot: Doc<'bots'> | null,
  channelThreads: Set<string | undefined>,
) => {
  for await (const chat of ctx.db
    .query('threads')
    .withIndex('by_project_and_bot', (q) =>
      q.eq('projectId', project._id).eq('botId', bot?._id).eq('kind', 'chat'),
    )
    .order('desc')) {
    if (!channelThreads.has(chat.threadId)) return chat.threadId
  }
  return null
}

/** Threads the messaging apps and email used to get of their own. */
export const getChannelThreads = async (ctx: Db, project: Doc<'projects'>) => {
  const threads = new Set<string | undefined>()
  for await (const link of ctx.db
    .query('phoneLinks')
    .withIndex('by_project', (q) => q.eq('projectId', project._id))) {
    // Only linked chats ever had threads of their own.
    if (link.status !== 'linked') continue
    threads.add(link.threadId)
    for (const t of link.botThreads ?? []) threads.add(t.threadId)
  }
  const mailbox = await ctx.db
    .query('mailboxes')
    .withIndex('by_user', (q) => q.eq('userId', project.ownerId))
    .unique()
  threads.add(mailbox?.threadId)
  threads.add(mailbox?.inboxThreadId)
  return threads
}

/** The bots in a thread, who its assistant can hand work to. None until you add them. */
export const getMembers = async (ctx: Db, thread: Doc<'threads'> | null) => {
  if (!thread?.memberIds?.length) return []
  const bots = await getBots(ctx, thread.projectId)
  return bots.filter((b) => thread.memberIds?.includes(b._id))
}
