import type { Db, Id } from '../../lib/ctx'

export async function getSettings(ctx: Db, userId: Id<'users'>) {
  return await ctx.db
    .query('newsSettings')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
}
