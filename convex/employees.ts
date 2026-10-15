import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import schema from './schema'

// ponytail: one shared team for everyone, scope it per user once there is auth.
export const MAX_TEAM = 20
const MAX_FIELDS = 10

export const list = query({
  args: {},
  returns: v.array(schema.doc('employees')),
  handler: async (ctx) => await ctx.db.query('employees').take(MAX_TEAM),
})

function clean(value: string, label: string, max: number) {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) {
    throw new ConvexError(`${label} must be 1 to ${max} characters.`)
  }
  return trimmed
}

// Insert when id is missing, otherwise update.
export const save = mutation({
  args: {
    id: v.optional(v.id('employees')),
    name: v.string(),
    role: v.string(),
    instructions: v.string(),
    fields: v.array(v.object({ label: v.string(), value: v.string() })),
  },
  returns: v.id('employees'),
  handler: async (ctx, args) => {
    const employee = {
      name: clean(args.name, 'Name', 40),
      role: clean(args.role, 'Role', 80),
      instructions: clean(args.instructions, 'Description', 2000),
      fields: args.fields
        .filter((f) => f.label.trim() || f.value.trim())
        .map((f) => ({
          label: clean(f.label, 'Field name', 40),
          value: clean(f.value, `${f.label.trim() || 'Field'} value`, 500),
        })),
    }
    if (employee.fields.length > MAX_FIELDS) {
      throw new ConvexError(`At most ${MAX_FIELDS} custom fields.`)
    }
    const taken = await ctx.db
      .query('employees')
      .withIndex('by_name', (q) => q.eq('name', employee.name))
      .first()
    if (taken && taken._id !== args.id) {
      throw new ConvexError(`${employee.name} is already on the team.`)
    }
    if (args.id) {
      await ctx.db.patch('employees', args.id, employee)
      return args.id
    }
    const team = await ctx.db.query('employees').take(MAX_TEAM)
    if (team.length >= MAX_TEAM) {
      throw new ConvexError(`The team is full (${MAX_TEAM} people).`)
    }
    return await ctx.db.insert('employees', employee)
  },
})

export const remove = mutation({
  args: { id: v.id('employees') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.delete('employees', id)
    return null
  },
})
