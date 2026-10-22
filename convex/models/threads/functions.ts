import { createThread } from '@convex-dev/agent'
import { zid } from 'convex-helpers/server/zod4'
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
import { getMainThread } from './queries'
import type { Doc, Id, MutationCtx } from '../../lib/ctx'

/**
 * An assistant's one thread, recorded on it, started on first use. Two first
 * messages at once can't both start one: both read and write the same
 * project or bot, so Convex runs them one after the other and the second
 * finds the first's.
 */
export const ensureMainThread = async (
  ctx: MutationCtx,
  project: Doc<'projects'>,
  bot: Doc<'bots'> | null,
) => {
  const recorded = getMainThread(project, bot)
  if (recorded) return recorded
  const threadId = await createThread(ctx, components.agent, {
    title: (bot ?? project).name,
    userId: project.ownerId,
  })
  if (bot) await ctx.db.patch('bots', bot._id, { threadId })
  else await ctx.db.patch('projects', project._id, { threadId })
  return threadId
}

/** The assistant `botId` names in `projectId` (the lead when unset), when `userId` owns it. */
const ownedAssistant = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  projectId: Id<'projects'>,
  botId?: Id<'bots'>,
) => {
  const project = await getOwnedProject(ctx, userId, projectId)
  const bot = botId ? await ctx.db.get('bots', botId) : null
  if (botId && bot?.projectId !== projectId) {
    throw new ConvexError('Assistant not found.')
  }
  return { project, bot }
}

/** An assistant's chat, started if it hasn't been: where `ask_bot`, tasks and tests post. */
const startMain = internalMutation({
  args: { projectId: v.id('projects'), botId: v.optional(v.id('bots')) },
  returns: v.string(),
  handler: async (ctx, { projectId, botId }) => {
    const project = await ctx.db.get('projects', projectId)
    if (!project) throw new Error('No such workspace.')
    const bot = botId ? await ctx.db.get('bots', botId) : null
    return await ensureMainThread(ctx, project, bot)
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

/** Sets who an assistant can hand work to: other bots in its workspace. */
const setMembers = authedMutation({
  args: {
    projectId: v.id('projects'),
    botId: v.optional(v.id('bots')),
    memberIds: v.array(v.id('bots')),
  },
  handler: async (ctx, { projectId, botId, memberIds }) => {
    const { bot } = await ownedAssistant(ctx, ctx.userId, projectId, botId)
    const bots = await getBots(ctx, projectId)
    if (
      memberIds.some((id) => id === bot?._id || !bots.some((b) => b._id === id))
    ) {
      throw new ConvexError('Only other assistants in this workspace can join.')
    }
    if (bot) await ctx.db.patch('bots', bot._id, { memberIds })
    else await ctx.db.patch('projects', projectId, { memberIds })
  },
})

/** Picks the model an assistant replies with from now on. Null goes back to the app's default. */
const setModel = zAuthedMutation({
  args: {
    projectId: zid('projects'),
    botId: zid('bots').optional(),
    model: z
      .string()
      .trim()
      .max(80)
      .regex(MODEL_ID, 'Use a gateway model id like anthropic/claude-sonnet-5.')
      .nullable(),
  },
  handler: async (ctx, { projectId, botId, model }) => {
    const { bot } = await ownedAssistant(ctx, ctx.userId, projectId, botId)
    const patch = { model: model ?? undefined }
    if (bot) await ctx.db.patch('bots', bot._id, patch)
    else await ctx.db.patch('projects', projectId, patch)
  },
})

/** Picks how hard an assistant's replies work from now on. Null goes back to medium. */
const setEffort = zAuthedMutation({
  args: {
    projectId: zid('projects'),
    botId: zid('bots').optional(),
    effort: z.enum(['low', 'medium', 'high']).nullable(),
  },
  handler: async (ctx, { projectId, botId, effort }) => {
    const { bot } = await ownedAssistant(ctx, ctx.userId, projectId, botId)
    const patch = { effort: effort ?? undefined }
    if (bot) await ctx.db.patch('bots', bot._id, patch)
    else await ctx.db.patch('projects', projectId, patch)
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
  startMain,
  main,
  setMembers,
  setModel,
  setEffort,
}
