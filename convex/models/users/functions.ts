import { v } from 'convex/values'
import { components } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import { authedQuery } from '../../lib/functions'

/** Called by the password provider when someone signs up. */
const createUser = internalMutation({
  args: {
    provider: v.object({
      name: v.literal('password'),
      accountId: v.string(),
      profile: v.object({ username: v.string() }),
    }),
  },
  returns: v.id('users'),
  handler: async (ctx) => await ctx.db.insert('users', {}),
})

const current = authedQuery({
  args: {},
  handler: async (ctx) => ({
    id: ctx.userId,
    username: await ctx.runQuery(components.authUsername.public.getUsername, {
      userId: ctx.userId,
    }),
  }),
})

export const usersApi = { createUser, current }
