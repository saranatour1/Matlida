import { createThread } from '@convex-dev/agent'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { components } from '../../_generated/api'
import { internalMutation, internalQuery } from '../../_generated/server'
import {
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import { MODEL_ID } from '../../lib/models'
import { getBots } from '../bots/queries'
import { getOwnedProject } from '../projects/queries'
import { threadsTable } from './table'
import { getMainThread, getOwnedThread } from './queries'
import type { Doc, Id, MutationCtx } from '../../lib/ctx'

type NewThread = Omit<Doc<'threads'>, '_id' | '_creationTime' | 'threadId'>

/** Creates an agent thread for `userId` and records which project it belongs to. */
export const startThread = async (
  ctx: MutationCtx,
  { userId, ...thread }: NewThread & { userId: Id<'users'> },
) => {
  const threadId = await createThread(ctx, components.agent, {
    title: thread.title,
    userId,
  })
  await ctx.db.insert('threads', { threadId, ...thread })
  return threadId
}

/**
 * An assistant's one thread, recorded on it, and started on first use with
 * `model` and `effort` when given. Two first messages at once can't both
 * start one: both read and write the same project or bot, so Convex runs
 * them one after the other and the second finds the first's.
 */
export const ensureMainThread = async (
  ctx: MutationCtx,
  project: Doc<'projects'>,
  bot: Doc<'bots'> | null,
  start: Pick<NewThread, 'model' | 'effort'> = {},
) => {
  const threadId =
    getMainThread(project, bot) ??
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
    return getMainThread(project, bot)
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

/** Work this chat started that hasn't finished, or failed, in words for `needs_follow_up`. */
const openWork = internalQuery({
  args: { threadId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, { threadId }) => {
    const videos = await ctx.db
      .query('videos')
      .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
      .order('desc')
      .take(10)
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
      .order('desc')
      .take(10)
    return [
      ...videos.flatMap((video) =>
        video.status === 'working'
          ? [`A video is still being made: ${video.prompt}`]
          : video.status === 'failed'
            ? [`A video failed (${video.error}): ${video.prompt}`]
            : [],
      ),
      ...tasks.flatMap((task) =>
        task.status === 'running'
          ? [`The task "${task.title}" is still running.`]
          : task.status === 'waiting_for_you'
            ? [`The task "${task.title}" is waiting for the user to start it.`]
            : task.status === 'failed'
              ? [`The task "${task.title}" failed.`]
              : [],
      ),
    ]
  },
})

export const threadsApi = {
  openWork,
  start,
  list,
  main,
  setMembers,
  get,
  setModel,
  setEffort,
}
