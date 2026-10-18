import { getAuthUserId } from '@convex-dev/auth/server'
import { customCtx, customQuery } from 'convex-helpers/server/customFunctions'
import { ConvexError } from 'convex/values'
import { query } from '../_generated/server'

/** Queries for signed-in users. They add `ctx.userId`, and throw when nobody is signed in. */
export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError('Sign in first.')
    return { userId }
  }),
)
