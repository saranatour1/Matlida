import type { Db, Id } from '../../lib/ctx'

/** A project's links: one per app, plus a pending code. */
export const getLinks = async (ctx: Db, projectId: Id<'projects'>) => {
  return await ctx.db
    .query('phoneLinks')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .order('desc')
    .take(10)
}

/** The project's most recently linked chat, where reminders text. */
export const getLink = async (ctx: Db, projectId: Id<'projects'>) => {
  const links = await getLinks(ctx, projectId)
  return links.find((l) => l.status === 'linked') ?? null
}
