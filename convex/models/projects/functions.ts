import { zid } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import { z } from 'zod'
import { query } from '../../_generated/server'
import { zMutation } from '../../lib/functions'

const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query('projects').take(50),
})

/** Looks up a project by an id from the URL. Null when there's no such project. */
const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const projectId = ctx.db.normalizeId('projects', id)
    return projectId ? await ctx.db.get('projects', projectId) : null
  },
})

/** Creates a project, or updates it when `id` is given. */
const save = zMutation({
  args: {
    id: zid('projects').optional(),
    name: z
      .string()
      .trim()
      .min(1, 'Give the project a name.')
      .max(40, 'Names can be at most 40 characters.'),
    brief: z
      .string()
      .trim()
      .max(2000, 'The brief can be at most 2000 characters.'),
    guidelines: z
      .string()
      .trim()
      .max(2000, 'Guidelines can be at most 2000 characters.'),
  },
  handler: async (ctx, { id, ...project }) => {
    if (id) {
      await ctx.db.patch('projects', id, project)
      return id
    }
    return await ctx.db.insert('projects', project)
  },
})

export const projectsApi = { list, get, save }
