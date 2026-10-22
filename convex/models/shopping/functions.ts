import { saveMessage } from '@convex-dev/agent'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { components, internal } from '../../_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import {
  authedMutation,
  authedQuery,
  zAuthedAction,
  zAuthedMutation,
} from '../../lib/functions'
import { checkoutLink, lookupVariant } from '../../lib/shopify'
import schema from '../../schema'
import { getDetails } from './queries'
import type { Offer } from '../../lib/shopify'
import type { ActionCtx, Doc, Id } from '../../lib/ctx'

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
  handler: async (ctx, { userId, offer, quantity: asked }) => {
    // 1 to 20, whatever the model or the caller asked for.
    const quantity = Math.min(Math.max(Math.round(asked) || 1, 1), 20)
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
export const addToCartFor = async (
  ctx: ActionCtx,
  userId: Id<'users'>,
  variantId: string,
  quantity: number,
): Promise<Offer> => {
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
const addToCart = zAuthedAction({
  args: {
    variantId: z.string().min(1),
    quantity: z.number().int().min(1).max(20).optional(),
  },
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

/** Starts watching an item for the tool, at the price it is now. */
const startWatch = internalMutation({
  args: {
    userId: v.id('users'),
    projectId: v.id('projects'),
    threadId: v.string(),
    offer: vOffer,
    target: v.number(),
  },
  returns: v.id('priceWatches'),
  handler: async (ctx, { offer, ...watch }) =>
    await ctx.db.insert('priceWatches', {
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

/** One watch, for its card. Null when it isn't yours. */
const watch = authedQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const watchId = ctx.db.normalizeId('priceWatches', id)
    const found = watchId && (await ctx.db.get('priceWatches', watchId))
    return found && found.userId === ctx.userId ? found : null
  },
})

const stopWatch = authedMutation({
  args: { id: v.id('priceWatches') },
  handler: async (ctx, { id }) => {
    const found = await ctx.db.get('priceWatches', id)
    if (found?.userId !== ctx.userId) throw new ConvexError('Watch not found.')
    if (found.status === 'watching') {
      await ctx.db.patch('priceWatches', id, { status: 'stopped' })
    }
  },
})

const HOUR = 60 * 60_000

/** Watches not checked for about a day, oldest first. */
const dueWatches = internalQuery({
  args: {},
  returns: v.array(schema.doc('priceWatches')),
  handler: async (ctx) =>
    await ctx.db
      .query('priceWatches')
      .withIndex('by_status_and_checkedAt', (q) =>
        q.eq('status', 'watching').lt('checkedAt', Date.now() - 23 * HOUR),
      )
      .take(50),
})

/** Records a check, and posts in the chat when the price dropped or the item went. */
const recordCheck = internalMutation({
  args: {
    id: v.id('priceWatches'),
    /** Null when the store stopped selling it. */
    price: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { id, price }) => {
    const found = await ctx.db.get('priceWatches', id)
    if (found?.status !== 'watching') return null
    const name = found.variantTitle
      ? `${found.title} (${found.variantTitle})`
      : found.title
    const amount = (minor: number) =>
      `${(minor / 100).toFixed(2)} ${found.currency}`
    const post = (content: string) =>
      saveMessage(ctx, components.agent, {
        threadId: found.threadId,
        message: { role: 'assistant', content },
      })
    if (price === null) {
      await ctx.db.patch('priceWatches', id, {
        status: 'gone',
        checkedAt: Date.now(),
      })
      await post(
        `_${name} isn't for sale anymore, so I've stopped watching it._`,
      )
      return null
    }
    const dropped = price <= found.target
    await ctx.db.patch('priceWatches', id, {
      lastPrice: price,
      checkedAt: Date.now(),
      status: dropped ? 'dropped' : 'watching',
    })
    if (dropped) {
      await post(
        `📉 **${name}** is down to **${amount(price)}**, at or under the ${amount(found.target)} you wanted.${found.url ? ` [See it](${found.url})` : ''} Want me to add it to your cart?`,
      )
    }
    return null
  },
})

/** Checks watched prices against the catalog. Hourly from `crons.ts`, so each watch about once a day. */
const checkPrices = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const watches: Array<Doc<'priceWatches'>> = await ctx.runQuery(
      internal.api.shopping.dueWatches,
      {},
    )
    for (const found of watches) {
      const { country }: { country: string | null } = await ctx.runQuery(
        internal.api.shopping.forAssistant,
        { userId: found.userId },
      )
      try {
        const offer = await lookupVariant(found.variantId, country ?? undefined)
        await ctx.runMutation(internal.api.shopping.recordCheck, {
          id: found._id,
          // Out of stock isn't gone: keep watching at the last price.
          price: !offer
            ? null
            : offer.available
              ? offer.price
              : found.lastPrice,
        })
      } catch (error) {
        // A failed lookup is tried again at the next check.
        console.error(error)
      }
    }
    return null
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
  startWatch,
  watch,
  stopWatch,
  dueWatches,
  recordCheck,
  checkPrices,
}
