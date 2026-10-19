import { getAuthUserId } from '@convex-dev/auth/server'
import {
  customCtx,
  customMutation,
  customQuery,
} from 'convex-helpers/server/customFunctions'
import { zCustomAction, zCustomMutation } from 'convex-helpers/server/zod4'
import { ConvexError } from 'convex/values'
import { action, mutation, query } from '../_generated/server'
import type { Auth } from 'convex/server'

const withUser = customCtx(async (ctx: { auth: Auth }) => {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new ConvexError('Sign in first.')
  return { userId }
})

/** Queries and mutations for signed-in users. They add `ctx.userId`, and throw when nobody is signed in. */
export const authedQuery = customQuery(query, withUser)
export const authedMutation = customMutation(mutation, withUser)

/**
 * Signed-in mutations and actions whose args are Zod schemas, for validating
 * user input at the boundary. Failed args throw `ConvexError({ ZodError: issues })`.
 */
export const zAuthedMutation = zCustomMutation(mutation, withUser)
export const zAuthedAction = zCustomAction(action, withUser)
