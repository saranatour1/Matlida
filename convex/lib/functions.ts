import { getAuthUserId } from '@convex-dev/auth/server'
import { customCtx, customQuery } from 'convex-helpers/server/customFunctions'
import { zCustomMutation } from 'convex-helpers/server/zod4'
import { ConvexError } from 'convex/values'
import { mutation, query } from '../_generated/server'
import type { Auth } from 'convex/server'

const withUser = customCtx(async (ctx: { auth: Auth }) => {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new ConvexError('Sign in first.')
  return { userId }
})

/** Queries for signed-in users. They add `ctx.userId`, and throw when nobody is signed in. */
export const authedQuery = customQuery(query, withUser)

/**
 * Signed-in mutations whose args are Zod schemas, for validating user input
 * at the boundary. Failed args throw `ConvexError({ ZodError: issues })`.
 */
export const zAuthedMutation = zCustomMutation(mutation, withUser)
