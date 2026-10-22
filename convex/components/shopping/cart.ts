import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { checkoutLink } from './checkout'
import { getDetails } from './details'
import schema, { vOffer } from './schema'
import type { Doc } from './_generated/dataModel'

/** Adds an offer to a user's cart, or more of it when it's there, at its current price. 1 to 20 of it. */
export const add = mutation({
  args: { userId: v.string(), offer: vOffer, quantity: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, offer, quantity: asked }) => {
    const quantity = Math.min(Math.max(Math.round(asked) || 1, 1), 20)
    const existing = await ctx.db
      .query('items')
      .withIndex('by_user_and_variant', (q) =>
        q.eq('userId', userId).eq('variantId', offer.variantId),
      )
      .unique()
    if (existing) {
      await ctx.db.patch('items', existing._id, {
        quantity: Math.min(existing.quantity + quantity, 20),
        price: offer.price,
      })
      return null
    }
    await ctx.db.insert('items', {
      userId,
      variantId: offer.variantId,
      variantNumber: offer.variantNumber,
      productId: offer.productId,
      title: offer.title,
      variantTitle: offer.variantTitle,
      image: offer.image,
      url: offer.url,
      price: offer.price,
      currency: offer.currency,
      quantity,
      seller: offer.seller,
      shop: offer.shop,
    })
    return null
  },
})

const itemsOf = async (ctx: Parameters<typeof getDetails>[0], userId: string) =>
  await ctx.db
    .query('items')
    .withIndex('by_user_and_variant', (q) => q.eq('userId', userId))
    .take(100)

/** A user's cart by store, each with its total and a checkout link with their details filled in. */
export const list = query({
  args: { userId: v.string() },
  returns: v.object({
    hasDetails: v.boolean(),
    shops: v.array(
      v.object({
        shop: v.string(),
        seller: v.string(),
        currency: v.string(),
        subtotal: v.number(),
        items: v.array(schema.doc('items')),
        checkoutUrl: v.string(),
      }),
    ),
  }),
  handler: async (ctx, { userId }) => {
    const items = await itemsOf(ctx, userId)
    const buyer = await getDetails(ctx, userId)
    const shops = new Map<string, Array<Doc<'items'>>>()
    for (const item of items) {
      shops.set(item.shop, [...(shops.get(item.shop) ?? []), item])
    }
    return {
      hasDetails: Boolean(buyer),
      shops: [...shops].map(([shop, shopItems]) => ({
        shop,
        seller: shopItems[0].seller,
        currency: shopItems[0].currency,
        subtotal: shopItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
        items: shopItems,
        checkoutUrl: checkoutLink(shop, shopItems, buyer),
      })),
    }
  },
})

/** Sets how many of an item, or removes it under 1. Only the item's owner can. */
export const setQuantity = mutation({
  args: { userId: v.string(), id: v.string(), quantity: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, id, quantity }) => {
    const itemId = ctx.db.normalizeId('items', id)
    const item = itemId && (await ctx.db.get('items', itemId))
    if (!item || item.userId !== userId)
      throw new ConvexError('Item not found.')
    if (quantity < 1) await ctx.db.delete('items', item._id)
    else {
      await ctx.db.patch('items', item._id, {
        quantity: Math.min(quantity, 20),
      })
    }
    return null
  },
})

/** After buying from a store: empties that store from the user's cart. */
export const clearShop = mutation({
  args: { userId: v.string(), shop: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, shop }) => {
    for (const item of await itemsOf(ctx, userId)) {
      if (item.shop === shop) await ctx.db.delete('items', item._id)
    }
    return null
  },
})
