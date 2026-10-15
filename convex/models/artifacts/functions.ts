import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { authedQuery } from '../../lib/functions'
import { getOwnedProject } from '../projects/functions'
import { artifactsTable } from './table'

const list = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await ctx.db
      .query('artifacts')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .order('desc')
      .take(50)
  },
})

/** Looks up an artifact by an id from the URL. Null unless it exists and is yours. */
const get = authedQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const artifactId = ctx.db.normalizeId('artifacts', id)
    const artifact = artifactId && (await ctx.db.get('artifacts', artifactId))
    const project =
      artifact && (await ctx.db.get('projects', artifact.projectId))
    return project?.ownerId === ctx.userId ? artifact : null
  },
})

const save = internalMutation({
  args: artifactsTable.validator.fields,
  returns: v.id('artifacts'),
  handler: async (ctx, artifact) => await ctx.db.insert('artifacts', artifact),
})

export const artifactsApi = { list, get, save }
