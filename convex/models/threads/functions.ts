import { createThread } from '@convex-dev/agent'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { components } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import {
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import { MODEL_ID } from '../../lib/models'
import { getBots } from '../bots/functions'
import { getOwnedProject } from '../projects/functions'
import { threadsTable } from './table'
import type { Doc, Id } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'

type NewThread = Omit<Doc<'threads'>, '_id' | '_creationTime' | 'threadId'>

/** Creates an agent thread for `userId` and records which project it belongs to. */
export async function startThread(
  ctx: MutationCtx,
  { userId, ...thread }: NewThread & { userId: Id<'users'> },
) {
  const threadId = await createThread(ctx, components.agent, {
    title: thread.title,
    userId,
  })
  await ctx.db.insert('threads', { threadId, ...thread })
  return threadId
}

/** The thread when `userId` owns its project, otherwise null. */
export async function getOwnedThread(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
  threadId: string,
) {
  const thread = await ctx.db
    .query('threads')
    .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
    .unique()
  const project = thread && (await ctx.db.get('projects', thread.projectId))
  return project?.ownerId === userId ? thread : null
}

/**
 * An assistant's one thread: the bot's, or the lead's when `bot` is null.
 * Before one was recorded, its newest chat, leaving out the chats Telegram,
 * iMessage, WhatsApp and email used to get of their own and the email inbox.
 * Null when it has never been talked to.
 */
export async function getMainThread(
  ctx: Pick<QueryCtx, 'db'>,
  project: Doc<'projects'>,
  bot: Doc<'bots'> | null,
) {
  const recorded = bot ? bot.threadId : project.threadId
  if (recorded) return recorded
  const links = await ctx.db
    .query('phoneLinks')
    .withIndex('by_project', (q) => q.eq('projectId', project._id))
    .take(10)
  const mailbox = await ctx.db
    .query('mailboxes')
    .withIndex('by_user', (q) => q.eq('userId', project.ownerId))
    .unique()
  const channelThreads = new Set([
    ...links.flatMap((l) =>
      l.status === 'linked'
        ? [l.threadId, ...(l.botThreads ?? []).map((t) => t.threadId)]
        : [],
    ),
    mailbox?.threadId,
    mailbox?.inboxThreadId,
  ])
  const chats = await ctx.db
    .query('threads')
    .withIndex('by_project_and_bot', (q) =>
      q.eq('projectId', project._id).eq('botId', bot?._id).eq('kind', 'chat'),
    )
    .order('desc')
    .take(20)
  return chats.find((c) => !channelThreads.has(c.threadId))?.threadId ?? null
}

/**
 * An assistant's one thread, recorded on it, and started on first use with
 * `model` and `effort` when given.
 */
export async function ensureMainThread(
  ctx: MutationCtx,
  project: Doc<'projects'>,
  bot: Doc<'bots'> | null,
  start: Pick<NewThread, 'model' | 'effort'> = {},
) {
  const threadId =
    (await getMainThread(ctx, project, bot)) ??
    (await startThread(ctx, {
      projectId: project._id,
      kind: 'chat',
      botId: bot?._id,
      title: (bot ?? project).name,
      userId: project.ownerId,
      ...start,
    }))
  if (bot && !bot.threadId) await ctx.db.patch('bots', bot._id, { threadId })
  if (!bot && !project.threadId) {
    await ctx.db.patch('projects', project._id, { threadId })
  }
  return threadId
}

/** The bots in a thread, who its assistant can hand work to. None until you add them. */
export async function getMembers(
  ctx: Pick<QueryCtx, 'db'>,
  thread: Doc<'threads'> | null,
) {
  if (!thread?.memberIds?.length) return []
  const bots = await getBots(ctx, thread.projectId)
  return bots.filter((b) => thread.memberIds?.includes(b._id))
}

/** Starts a thread from an action, such as a sub-thread for a bot. */
const start = internalMutation({
  args: {
    ...threadsTable.validator.omit('threadId').fields,
    userId: v.id('users'),
  },
  returns: v.string(),
  handler: startThread,
})

const list = authedQuery({
  args: {
    projectId: v.id('projects'),
    kind: threadsTable.validator.fields.kind,
  },
  handler: async (ctx, { projectId, kind }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await ctx.db
      .query('threads')
      .withIndex('by_project_and_kind', (q) =>
        q.eq('projectId', projectId).eq('kind', kind),
      )
      .order('desc')
      .take(50)
  },
})

/** An assistant's one thread, or null before its first message. `botId` unset means the lead. */
const main = authedQuery({
  args: { projectId: v.id('projects'), botId: v.optional(v.id('bots')) },
  handler: async (ctx, { projectId, botId }) => {
    const project = await getOwnedProject(ctx, ctx.userId, projectId)
    const bot = botId ? await ctx.db.get('bots', botId) : null
    if (botId && bot?.projectId !== projectId) return null
    return await getMainThread(ctx, project, bot)
  },
})

/** Sets who the thread's assistant can hand work to. */
const setMembers = authedMutation({
  args: { threadId: v.string(), memberIds: v.array(v.id('bots')) },
  handler: async (ctx, { threadId, memberIds }) => {
    const thread = await getOwnedThread(ctx, ctx.userId, threadId)
    if (!thread) throw new ConvexError('Chat not found.')
    const bots = await getBots(ctx, thread.projectId)
    if (
      memberIds.some(
        (id) => id === thread.botId || !bots.some((b) => b._id === id),
      )
    ) {
      throw new ConvexError('Only other assistants in this workspace can join.')
    }
    await ctx.db.patch('threads', thread._id, { memberIds })
  },
})

const get = authedQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) =>
    await getOwnedThread(ctx, ctx.userId, threadId),
})

/** Picks the model this chat's replies use from now on. The chat's history stays. Null goes back to the assistant's own. */
const setModel = zAuthedMutation({
  args: {
    threadId: z.string(),
    model: z
      .string()
      .trim()
      .max(80)
      .regex(MODEL_ID, 'Use a gateway model id like anthropic/claude-sonnet-5.')
      .nullable(),
  },
  handler: async (ctx, { threadId, model }) => {
    const thread = await getOwnedThread(ctx, ctx.userId, threadId)
    if (!thread) throw new ConvexError('Chat not found.')
    await ctx.db.patch('threads', thread._id, { model: model ?? undefined })
  },
})

/** Picks how hard this chat's replies work from now on. Null goes back to the assistant's own. */
const setEffort = zAuthedMutation({
  args: {
    threadId: z.string(),
    effort: z.enum(['low', 'medium', 'high']).nullable(),
  },
  handler: async (ctx, { threadId, effort }) => {
    const thread = await getOwnedThread(ctx, ctx.userId, threadId)
    if (!thread) throw new ConvexError('Chat not found.')
    await ctx.db.patch('threads', thread._id, { effort: effort ?? undefined })
  },
})

export const threadsApi = {
  start,
  list,
  main,
  setMembers,
  get,
  setModel,
  setEffort,
}
