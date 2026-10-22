import { ConvexError } from 'convex/values'
import type { Db, Id } from '../../lib/ctx'

/** The project when `userId` owns it. Throws a user-facing error otherwise. */
export const getOwnedProject = async (
  ctx: Db,
  userId: Id<'users'>,
  projectId: Id<'projects'>,
) => {
  const project = await ctx.db.get('projects', projectId)
  if (project?.ownerId !== userId) throw new ConvexError('Project not found.')
  return project
}
