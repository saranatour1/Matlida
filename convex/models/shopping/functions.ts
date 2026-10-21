import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import { internalMutation, internalQuery } from '../../_generated/server'
import {
  authedAction,
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import { checkoutLink, lookupVariant } from '../../lib/shopify'
import type { Doc, Id } from '../../_generated/dataModel'
import type { ActionCtx, QueryCtx } from '../../_generated/server'
import type { Offer } from '../../lib/shopify'

async function getDetails(ctx: Pick<QueryCtx, 'db'>, userId: Id<'users'>) {
  return await ctx.db
    .query('shoppingDetails')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
}

/** Your details, for the Settings form. Null before you save them. */
const details = authedQuery({
  args: {},
  handler: async (ctx) => await getDetails(ctx, ctx.userId),
})

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || undefined)
    .optional()

const saveDetails = zAuthedMutation({
  args: {
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    email: z.email(),
    address1: z.string().trim().min(1).max(120),
    address2: optional(120),
    city: z.string().trim().min(1).max(80),
    province: optional(80),
    zip: z.string().trim().min(1).max(20),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'Use the two-letter country code, like US or AE.'),
    notes: optional(1000),
  },
  handler: async (ctx, fields) => {
    const existing = await getDetails(ctx, ctx.userId)
    const row = { userId: ctx.userId, ...fields }
    if (existing) await ctx.db.replace('shoppingDetails', existing._id, row)
    else await ctx.db.insert('shoppingDetails', row)
  },
})

/** Where searches ship to, and your sizes and preferences, for the assistants. */
const forAssistant = internalQuery({
  args: { userId: v.id('users') },
  returns: v.object({
    country: v.union(v.string(), v.null()),
    notes: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { userId }) => {
    const found = await getDetails(ctx, userId)
    return { country: found?.country ?? null, notes: found?.notes ?? null }
  },
})

const vOffer = v.object({
  productId: v.string(),
  variantId: v.string(),
  title: v.string(),
  variantTitle: v.optional(v.string()),
  image: v.optional(v.string()),
  url: v.optional(v.string()),
  price: v.number(),
  listPrice: v.optional(v.number()),
  currency: v.string(),
  available: v.boolean(),
  rating: v.optional(v.number()),
  ratingCount: v.optional(v.number()),
  seller: v.string(),
  shop: v.string(),
  variantNumber: v.string(),
})

/** Adds an offer to your cart, or more of it when it's there, at its current price. */
const addItem = internalMutation({
  args: { userId: v.id('users'), offer: vOffer, quantity: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, offer, quantity }) => {
    const existing = await ctx.db
      .query('cartItems')
      .withIndex('by_user_and_variant', (q) =>
        q.eq('userId', userId).eq('variantId', offer.variantId),
      )
      .unique()
    if (existing) {
      await ctx.db.patch('cartItems', existing._id, {
        quantity: Math.min(existing.quantity + quantity, 20),
        price: offer.price,
      })
      return null
    }
    await ctx.db.insert('cartItems', {
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

/**
 * Checks `variantId` against the catalog and adds it to `userId`'s cart, so
 * the cart only ever holds real items at real prices.
 */
export async function addToCartFor(
  ctx: ActionCtx,
  userId: Id<'users'>,
  variantId: string,
  quantity: number,
): Promise<Offer> {
  const { country }: { country: string | null } = await ctx.runQuery(
    internal.api.shopping.forAssistant,
    { userId },
  )
  const offer = await lookupVariant(variantId, country ?? undefined)
  if (!offer) throw new ConvexError('That item isn’t for sale anymore.')
  if (!offer.available) throw new ConvexError('That item is out of stock.')
  await ctx.runMutation(internal.api.shopping.addItem, {
    userId,
    offer,
    quantity,
  })
  return offer
}

/** A product card's Add to cart. */
const addToCart = authedAction({
  args: { variantId: v.string(), quantity: v.optional(v.number()) },
  handler: async (ctx, { variantId, quantity = 1 }) => {
    await addToCartFor(ctx, ctx.userId, variantId, quantity)
  },
})

/** Your cart by store, each with its total and a checkout link with your details filled in. */
const cart = authedQuery({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db
      .query('cartItems')
      .withIndex('by_user_and_variant', (q) => q.eq('userId', ctx.userId))
      .take(100)
    const buyer = await getDetails(ctx, ctx.userId)
    const shops = new Map<string, Array<Doc<'cartItems'>>>()
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

const setQuantity = authedMutation({
  args: { id: v.id('cartItems'), quantity: v.number() },
  handler: async (ctx, { id, quantity }) => {
    const item = await ctx.db.get('cartItems', id)
    if (item?.userId !== ctx.userId) throw new ConvexError('Item not found.')
    if (quantity < 1) await ctx.db.delete('cartItems', id)
    else
      await ctx.db.patch('cartItems', id, { quantity: Math.min(quantity, 20) })
  },
})

/** After you've bought from a store: empties that store from your cart. */
const clearShop = authedMutation({
  args: { shop: v.string() },
  handler: async (ctx, { shop }) => {
    const items = await ctx.db
      .query('cartItems')
      .withIndex('by_user_and_variant', (q) => q.eq('userId', ctx.userId))
      .take(100)
    for (const item of items) {
      if (item.shop === shop) await ctx.db.delete('cartItems', item._id)
    }
  },
})

export const shoppingApi = {
  details,
  saveDetails,
  forAssistant,
  addItem,
  addToCart,
  cart,
  setQuantity,
  clearShop,
}
