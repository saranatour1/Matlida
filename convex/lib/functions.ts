import { getAuthUserId } from '@convex-dev/auth/server'
import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from 'convex-helpers/server/customFunctions'
import { zCustomAction, zCustomMutation } from 'convex-helpers/server/zod4'
import type { Auth } from 'convex/server'
import { ConvexError } from 'convex/values'
import { action, mutation, query } from '../_generated/server'

const withUser = customCtx(async (ctx: { auth: Auth }) => {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new ConvexError('Sign in first.')
  return { userId }
})

/** Public functions for signed-in users only. They add `ctx.userId` and throw when nobody is signed in. */
export const authedQuery = customQuery(query, withUser)
export const authedMutation = customMutation(mutation, withUser)
export const authedAction = customAction(action, withUser)

/**
 * Authed mutations and actions whose args are Zod schemas, for validating user
 * input at the boundary. Failed args throw `ConvexError({ ZodError: issues })`.
 */
export const zAuthedMutation = zCustomMutation(mutation, withUser)
export const zAuthedAction = zCustomAction(action, withUser)
