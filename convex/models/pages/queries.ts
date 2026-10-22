import type { Db, Id } from '../../lib/ctx'

/** The page when `userId` owns its workspace, or null. `id` may come from a model, so it may not be an id. */
export const getOwnedPage = async (
  ctx: Db,
  userId: Id<'users'>,
  id: string,
) => {
  const pageId = ctx.db.normalizeId('pages', id)
  const page = pageId && (await ctx.db.get('pages', pageId))
  const project = page && (await ctx.db.get('projects', page.projectId))
  return project?.ownerId === userId ? page : null
}
