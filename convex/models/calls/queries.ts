import { ConvexError } from 'convex/values'
import { getOwnedProject } from '../projects/queries'
import type { Db, Id } from '../../lib/ctx'

export const getOwnedCall = async (
  ctx: Db,
  userId: Id<'users'>,
  id: Id<'calls'>,
) => {
  const call = await ctx.db.get('calls', id)
  if (!call) throw new ConvexError('Call not found.')
  await getOwnedProject(ctx, userId, call.projectId)
  return call
}

export const linesOf = (ctx: Db, callId: Id<'calls'>) => {
  return ctx.db
    .query('callLines')
    .withIndex('by_call', (q) => q.eq('callId', callId))
}
