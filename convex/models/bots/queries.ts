import type { Db, Id } from '../../lib/ctx'

export const MAX_BOTS = 20

/** A project's bots, at most `MAX_BOTS`. */
export async function getBots(ctx: Db, projectId: Id<'projects'>) {
  return await ctx.db
    .query('bots')
    .withIndex('by_project_and_name', (q) => q.eq('projectId', projectId))
    .take(MAX_BOTS)
}
