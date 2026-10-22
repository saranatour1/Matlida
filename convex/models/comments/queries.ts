import { ConvexError } from 'convex/values'
import { getOwnedProject } from '../projects/queries'
import type { Db, Doc, Id } from '../../lib/ctx'

export const MAX_COMMENTS = 100

/** Throws unless the target is in `project`: the project itself, one of its bots, or one of its commands. */
export async function checkTarget(
  ctx: Db,
  project: Doc<'projects'>,
  kind: Doc<'comments'>['kind'],
  targetId: string,
) {
  if (kind === 'project') {
    if (targetId !== project._id)
      throw new ConvexError('Not in this workspace.')
    return
  }
  const target =
    kind === 'bot'
      ? await botById(ctx, targetId)
      : await commandById(ctx, targetId)
  if (target?.projectId !== project._id) {
    throw new ConvexError('Not in this workspace.')
  }
}

export async function botById(ctx: Db, targetId: string) {
  const id = ctx.db.normalizeId('bots', targetId)
  return id ? await ctx.db.get('bots', id) : null
}

export async function commandById(ctx: Db, targetId: string) {
  const id = ctx.db.normalizeId('commands', targetId)
  return id ? await ctx.db.get('commands', id) : null
}

export async function getComments(
  ctx: Db,
  projectId: Id<'projects'>,
  kind: Doc<'comments'>['kind'],
  targetId: string,
) {
  return await ctx.db
    .query('comments')
    .withIndex('by_target', (q) =>
      q.eq('projectId', projectId).eq('kind', kind).eq('targetId', targetId),
    )
    .take(MAX_COMMENTS)
}

export async function getOwnedComment(
  ctx: Db,
  userId: Id<'users'>,
  id: Id<'comments'>,
) {
  const comment = await ctx.db.get('comments', id)
  if (!comment) throw new ConvexError('Note not found.')
  await getOwnedProject(ctx, userId, comment.projectId)
  return comment
}
