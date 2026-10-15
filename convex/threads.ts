import { createThread } from '@convex-dev/agent'
import { v } from 'convex/values'
import { components } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { internalMutation, query, type MutationCtx } from './_generated/server'
import schema from './schema'

const vKind = schema.tables.threads.validator.fields.kind

export async function startThread(
  ctx: MutationCtx,
  args: {
    projectId: Id<'projects'>
    kind: 'chat' | 'employee'
    title: string
    parentThreadId?: string
  },
) {
  const threadId = await createThread(ctx, components.agent, {
    title: args.title,
  })
  await ctx.db.insert('threads', { threadId, ...args })
  return threadId
}

export const start = internalMutation({
  args: {
    projectId: v.id('projects'),
    kind: vKind,
    title: v.string(),
    parentThreadId: v.optional(v.string()),
  },
  returns: v.string(),
  handler: startThread,
})

export const list = query({
  args: { projectId: v.id('projects'), kind: vKind },
  returns: v.array(schema.doc('threads')),
  handler: async (ctx, { projectId, kind }) =>
    await ctx.db
      .query('threads')
      .withIndex('by_project_and_kind', (q) =>
        q.eq('projectId', projectId).eq('kind', kind),
      )
      .order('desc')
      .take(50),
})

export const get = query({
  args: { threadId: v.string() },
  returns: v.union(schema.doc('threads'), v.null()),
  handler: async (ctx, { threadId }) =>
    await ctx.db
      .query('threads')
      .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
      .unique(),
})
