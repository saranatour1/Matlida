import type { Db, Id } from '../../lib/ctx'

export const getSettings = async (ctx: Db, userId: Id<'users'>) => {
  return await ctx.db
    .query('newsSettings')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
}
