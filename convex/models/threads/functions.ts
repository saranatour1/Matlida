import { createThread } from '@convex-dev/agent'
import { v } from 'convex/values'
import { components } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import {
  internalMutation,
  query,
  type MutationCtx,
} from '../../_generated/server'
import { threadsTable } from './table'

type NewThread = Omit<Doc<'threads'>, '_id' | '_creationTime' | 'threadId'>

/** Creates an agent thread and records which project it belongs to. */
export async function startThread(ctx: MutationCtx, thread: NewThread) {
  const threadId = await createThread(ctx, components.agent, {
    title: thread.title,
  })
  await ctx.db.insert('threads', { threadId, ...thread })
  return threadId
}

const start = internalMutation({
  args: threadsTable.validator.omit('threadId').fields,
  returns: v.string(),
  handler: startThread,
})

const list = query({
  args: {
    projectId: v.id('projects'),
    kind: threadsTable.validator.fields.kind,
  },
  handler: async (ctx, { projectId, kind }) =>
    await ctx.db
      .query('threads')
      .withIndex('by_project_and_kind', (q) =>
        q.eq('projectId', projectId).eq('kind', kind),
      )
      .order('desc')
      .take(50),
})

const get = query({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) =>
    await ctx.db
      .query('threads')
      .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
      .unique(),
})

export const threadsApi = { start, list, get }
