import { v } from 'convex/values'
import { internalMutation, query } from './_generated/server'
import schema from './schema'

export const list = query({
  args: { projectId: v.id('projects') },
  returns: v.array(schema.doc('artifacts')),
  handler: async (ctx, { projectId }) =>
    await ctx.db
      .query('artifacts')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .order('desc')
      .take(50),
})

export const get = query({
  args: { id: v.string() },
  returns: v.union(schema.doc('artifacts'), v.null()),
  handler: async (ctx, { id }) => {
    const artifactId = ctx.db.normalizeId('artifacts', id)
    return artifactId ? await ctx.db.get('artifacts', artifactId) : null
  },
})

export const save = internalMutation({
  args: {
    projectId: v.id('projects'),
    threadId: v.string(),
    title: v.string(),
    content: v.string(),
  },
  returns: v.id('artifacts'),
  handler: async (ctx, args) => await ctx.db.insert('artifacts', args),
})
