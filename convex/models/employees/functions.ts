import { zid } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import type { Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import {
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import { getOwnedProject } from '../projects/functions'

export const MAX_TEAM = 20

/** A project's employees, at most `MAX_TEAM`. */
export async function getTeam(
  ctx: Pick<QueryCtx, 'db'>,
  projectId: Id<'projects'>,
) {
  return await ctx.db
    .query('employees')
    .withIndex('by_project_and_name', (q) => q.eq('projectId', projectId))
    .take(MAX_TEAM)
}

const list = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await getTeam(ctx, projectId)
  },
})

/** Adds an employee to a project, or updates one when `id` is given. */
const save = zAuthedMutation({
  args: {
    projectId: zid('projects'),
    id: zid('employees').optional(),
    name: z
      .string()
      .trim()
      .min(1, 'Give the employee a name.')
      .max(40, 'Names can be at most 40 characters.'),
    role: z
      .string()
      .trim()
      .min(1, 'Give the employee a role.')
      .max(80, 'Roles can be at most 80 characters.'),
    instructions: z
      .string()
      .trim()
      .min(1, 'Describe what the employee does.')
      .max(2000, 'Descriptions can be at most 2000 characters.'),
    fields: z
      .array(
        z.object({
          label: z
            .string()
            .trim()
            .min(1, 'Every custom field needs a name.')
            .max(40, 'Field names can be at most 40 characters.'),
          value: z
            .string()
            .trim()
            .min(1, 'Every custom field needs a value.')
            .max(500, 'Field values can be at most 500 characters.'),
        }),
      )
      .max(10, 'At most 10 custom fields.'),
  },
  handler: async (ctx, { projectId, id, ...employee }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    const team = await getTeam(ctx, projectId)
    if (id && !team.some((e) => e._id === id)) {
      throw new ConvexError('Employee not found.')
    }
    if (team.some((e) => e.name === employee.name && e._id !== id)) {
      throw new ConvexError(`${employee.name} is already on the team.`)
    }
    if (id) {
      await ctx.db.patch('employees', id, employee)
      return id
    }
    if (team.length >= MAX_TEAM) {
      throw new ConvexError(`The team is full (${MAX_TEAM} people).`)
    }
    return await ctx.db.insert('employees', { projectId, ...employee })
  },
})

const remove = authedMutation({
  args: { id: v.id('employees') },
  handler: async (ctx, { id }) => {
    const employee = await ctx.db.get('employees', id)
    if (!employee) throw new ConvexError('Employee not found.')
    await getOwnedProject(ctx, ctx.userId, employee.projectId)
    await ctx.db.delete('employees', id)
  },
})

export const employeesApi = { list, save, remove }
