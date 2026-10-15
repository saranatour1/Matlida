import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { clean } from './employees'
import schema from './schema'

// ponytail: projects are shared by everyone and can't be deleted yet.
export const list = query({
  args: {},
  returns: v.array(schema.doc('projects')),
  handler: async (ctx) => await ctx.db.query('projects').take(50),
})

export const get = query({
  args: { id: v.string() },
  returns: v.union(schema.doc('projects'), v.null()),
  handler: async (ctx, { id }) => {
    const projectId = ctx.db.normalizeId('projects', id)
    return projectId ? await ctx.db.get('projects', projectId) : null
  },
})

// Insert when id is missing, otherwise update.
export const save = mutation({
  args: {
    id: v.optional(v.id('projects')),
    name: v.string(),
    brief: v.string(),
    guidelines: v.string(),
  },
  returns: v.id('projects'),
  handler: async (ctx, args) => {
    const brief = args.brief.trim()
    const guidelines = args.guidelines.trim()
    if (brief.length > 2000 || guidelines.length > 2000) {
      throw new ConvexError(
        'The brief and guidelines can be at most 2000 characters each.',
      )
    }
    const project = { name: clean(args.name, 'Name', 40), brief, guidelines }
    if (args.id) {
      await ctx.db.patch('projects', args.id, project)
      return args.id
    }
    return await ctx.db.insert('projects', project)
  },
})
