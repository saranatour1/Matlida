import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { budgetOf } from '../../lib/budget'
import { authedQuery } from '../../lib/functions'
import { getOwnedThread } from '../threads/functions'
import { usageTable } from './table'
import type { ImageModelProviderMetadata, ProviderMetadata } from 'ai'

/** The gateway's dollar cost from a model call's provider metadata, or 0. */
export function gatewayCost(
  metadata: ProviderMetadata | ImageModelProviderMetadata | undefined,
) {
  // Absent when the call didn't go through the gateway, whatever the record type says.
  const gateway = metadata?.convexGateway as { cost?: unknown } | undefined
  const cost = gateway?.cost
  return typeof cost === 'number' ? cost : 0
}

const record = internalMutation({
  args: usageTable.validator,
  returns: v.null(),
  handler: async (ctx, row) => {
    await ctx.db.insert('usage', row)
    return null
  },
})

/** A chat's usage, newest first. */
const forThread = authedQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    if (!(await getOwnedThread(ctx, ctx.userId, threadId))) return []
    return await ctx.db
      .query('usage')
      .withIndex('by_thread', (q) => q.eq('threadId', threadId))
      .order('desc')
      .take(200)
  },
})

/** What you've spent on AI this month, and your cap. */
const budget = authedQuery({
  args: {},
  handler: async (ctx) => await budgetOf(ctx, ctx.userId),
})

export const usageApi = { record, forThread, budget }
