import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import schema from './schema'
import type { QueryCtx } from './_generated/server'

export const getDetails = async (ctx: Pick<QueryCtx, 'db'>, userId: string) =>
  await ctx.db
    .query('details')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()

/** A user's details, or null before they saved them. */
export const get = query({
  args: { userId: v.string() },
  returns: v.union(schema.doc('details'), v.null()),
  handler: async (ctx, { userId }) => await getDetails(ctx, userId),
})

/** Saves a user's details, replacing what was there. The app checks the fields first. */
export const save = mutation({
  args: {
    userId: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    address1: v.string(),
    address2: v.optional(v.string()),
    city: v.string(),
    province: v.optional(v.string()),
    zip: v.string(),
    country: v.string(),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, row) => {
    const existing = await getDetails(ctx, row.userId)
    if (existing) await ctx.db.replace('details', existing._id, row)
    else await ctx.db.insert('details', row)
    return null
  },
})
