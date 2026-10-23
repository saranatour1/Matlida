import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import schema, { vOffer } from './schema'

/** Starts watching an item for a user, at the price it is now. */
export const start = mutation({
  args: {
    userId: v.string(),
    projectId: v.string(),
    threadId: v.string(),
    offer: vOffer,
    target: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, { offer, ...watch }) =>
    await ctx.db.insert('watches', {
      ...watch,
      variantId: offer.variantId,
      title: offer.title,
      variantTitle: offer.variantTitle,
      url: offer.url,
      currency: offer.currency,
      lastPrice: offer.price,
      checkedAt: Date.now(),
      status: 'watching',
    }),
})

/** One watch, for its card. Null when it isn't the user's. */
export const get = query({
  args: { userId: v.string(), id: v.string() },
  returns: v.union(schema.doc('watches'), v.null()),
  handler: async (ctx, { userId, id }) => {
    const watchId = ctx.db.normalizeId('watches', id)
    const found = watchId && (await ctx.db.get('watches', watchId))
    return found && found.userId === userId ? found : null
  },
})

export const stop = mutation({
  args: { userId: v.string(), id: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, id }) => {
    const watchId = ctx.db.normalizeId('watches', id)
    const found = watchId && (await ctx.db.get('watches', watchId))
    if (!found || found.userId !== userId) {
      throw new ConvexError('Watch not found.')
    }
    if (found.status === 'watching') {
      await ctx.db.patch('watches', found._id, { status: 'stopped' })
    }
    return null
  },
})

/**
 * Records a check. Returns what to tell the chat when the price dropped or
 * the item went, with the chat to say it in, or null when there's nothing to say.
 */
export const recordCheck = mutation({
  args: {
    id: v.id('watches'),
    /** Null when the store stopped selling it. */
    price: v.union(v.number(), v.null()),
  },
  returns: v.union(
    v.object({ threadId: v.string(), message: v.string() }),
    v.null(),
  ),
  handler: async (ctx, { id, price }) => {
    const found = await ctx.db.get('watches', id)
    if (found?.status !== 'watching') return null
    const name = found.variantTitle
      ? `${found.title} (${found.variantTitle})`
      : found.title
    const amount = (minor: number) =>
      `${(minor / 100).toFixed(2)} ${found.currency}`
    if (price === null) {
      await ctx.db.patch('watches', id, {
        status: 'gone',
        checkedAt: Date.now(),
      })
      return {
        threadId: found.threadId,
        message: `_${name} isn't for sale anymore, so I've stopped watching it._`,
      }
    }
    const dropped = price <= found.target
    await ctx.db.patch('watches', id, {
      lastPrice: price,
      checkedAt: Date.now(),
      status: dropped ? 'dropped' : 'watching',
    })
    return dropped
      ? {
          threadId: found.threadId,
          message: `📉 **${name}** is down to **${amount(price)}**, at or under the ${amount(found.target)} you wanted.${found.url ? ` [See it](${found.url})` : ''} Want me to add it to your cart?`,
        }
      : null
  },
})
