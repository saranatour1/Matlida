import type { Db, Id } from '../../lib/ctx'

export async function getDetails(ctx: Db, userId: Id<'users'>) {
  return await ctx.db
    .query('shoppingDetails')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
}
