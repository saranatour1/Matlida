import { createThread } from '@convex-dev/agent'
import { v } from 'convex/values'
import { components } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import { authedQuery } from '../../lib/functions'
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

const get = authedQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) =>
    await getOwnedThread(ctx, ctx.userId, threadId),
})

export const threadsApi = { start, list, get }
