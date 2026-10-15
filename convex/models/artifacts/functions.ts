import { v } from 'convex/values'
import { internalMutation, query } from '../../_generated/server'
import { artifactsTable } from './table'

const list = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) =>
    await ctx.db
      .query('artifacts')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .order('desc')
      .take(50),
})

/** Looks up an artifact by an id from the URL. Null when there's no such artifact. */
const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const artifactId = ctx.db.normalizeId('artifacts', id)
    return artifactId ? await ctx.db.get('artifacts', artifactId) : null
  },
})

const save = internalMutation({
  args: artifactsTable.validator.fields,
  returns: v.id('artifacts'),
  handler: async (ctx, artifact) => await ctx.db.insert('artifacts', artifact),
})

export const artifactsApi = { list, get, save }
