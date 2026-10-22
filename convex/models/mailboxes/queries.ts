import type { Db, Id } from '../../lib/ctx'

/** The user's mailbox, or null before they claim a handle. */
export async function getMailbox(ctx: Db, userId: Id<'users'>) {
  return await ctx.db
    .query('mailboxes')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
}
