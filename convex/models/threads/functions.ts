import { createThread } from '@convex-dev/agent'
import { ConvexError, v } from 'convex/values'
import { components } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import { authedMutation, authedQuery } from '../../lib/functions'
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

/** One assistant's recent chats: a bot's, or the lead's when `botId` is unset. */
const listForBot = authedQuery({
  args: { projectId: v.id('projects'), botId: v.optional(v.id('bots')) },
  handler: async (ctx, { projectId, botId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await ctx.db
      .query('threads')
      .withIndex('by_project_and_bot', (q) =>
        q.eq('projectId', projectId).eq('botId', botId),
      )
      .order('desc')
      .take(20)
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

/** Starts a chat where the lead works with the bots you picked. */
const startGroup = authedMutation({
  args: { projectId: v.id('projects'), memberIds: v.array(v.id('bots')) },
  handler: async (ctx, { projectId, memberIds }) => {
    const project = await getOwnedProject(ctx, ctx.userId, projectId)
    const bots = await getBots(ctx, projectId)
    const members = bots.filter((b) => memberIds.includes(b._id))
    if (members.length === 0 || members.length !== memberIds.length) {
      throw new ConvexError('Pick at least one assistant from this workspace.')
    }
    return await startThread(ctx, {
      projectId,
      kind: 'chat',
      title: `${project.name}, ${members.map((m) => m.name).join(', ')}`.slice(
        0,
        60,
      ),
      memberIds: members.map((m) => m._id),
      userId: ctx.userId,
    })
  },
})

const get = authedQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) =>
    await getOwnedThread(ctx, ctx.userId, threadId),
})

export const threadsApi = {
  start,
  list,
  listForBot,
  setMembers,
  startGroup,
  get,
}
