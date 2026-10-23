import { saveMessage } from '@convex-dev/agent'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { components, internal } from '../../_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import { vOffer } from '../../components/shopping/schema'
import {
  authedMutation,
  authedQuery,
  zAuthedAction,
  zAuthedMutation,
} from '../../lib/functions'
import { lookupVariant } from '../../lib/shopify'
import type { Offer } from '../../lib/shopify'
import type { ActionCtx, Id } from '../../lib/ctx'

/**
 * The shopping component holds your details, your cart and your price
 * watches. These functions check who you are, then hand it your user id;
 * the catalog is looked up here, since the component only keeps rows.
 */

/** Your details, for the Settings form. Null before you save them. */
const details = authedQuery({
  args: {},
  handler: async (ctx) =>
    await ctx.runQuery(components.shopping.details.get, { userId: ctx.userId }),
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
    await ctx.runMutation(components.shopping.details.save, {
      userId: ctx.userId,
      ...fields,
    })
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
    const found = await ctx.runQuery(components.shopping.details.get, {
      userId,
    })
    return { country: found?.country ?? null, notes: found?.notes ?? null }
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
  await ctx.runMutation(components.shopping.cart.add, {
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
  handler: async (ctx) =>
    await ctx.runQuery(components.shopping.cart.list, { userId: ctx.userId }),
})

const setQuantity = authedMutation({
  args: { id: v.string(), quantity: v.number() },
  handler: async (ctx, args) => {
    await ctx.runMutation(components.shopping.cart.setQuantity, {
      userId: ctx.userId,
      ...args,
    })
  },
})

/** After you've bought from a store: empties that store from your cart. */
const clearShop = authedMutation({
  args: { shop: v.string() },
  handler: async (ctx, { shop }) => {
    await ctx.runMutation(components.shopping.cart.clearShop, {
      userId: ctx.userId,
      shop,
    })
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
  returns: v.string(),
  handler: async (ctx, args) => {
    const id = await ctx.runMutation(components.shopping.watches.start, args)
    await ctx.scheduler.runAfter(
      WATCH_EVERY_MS,
      internal.api.shopping.checkWatch,
      {
        userId: args.userId,
        id,
      },
    )
    return id
  },
})

/** One watch, for its card. Null when it isn't yours. */
const watch = authedQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) =>
    await ctx.runQuery(components.shopping.watches.get, {
      userId: ctx.userId,
      id,
    }),
})

const stopWatch = authedMutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await ctx.runMutation(components.shopping.watches.stop, {
      userId: ctx.userId,
      id,
    })
  },
})

/** A watched price is checked once a day. */
const WATCH_EVERY_MS = 24 * 60 * 60_000

/**
 * Checks one watched price against the catalog, then schedules its next
 * check a day later. A watch that stopped, dropped or went ends here, so
 * only watches someone asked for are ever checked.
 */
const checkWatch = internalAction({
  args: { userId: v.id('users'), id: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, id }) => {
    const found = await ctx.runQuery(components.shopping.watches.get, {
      userId,
      id,
    })
    if (found?.status !== 'watching') return null
    const { country }: { country: string | null } = await ctx.runQuery(
      internal.api.shopping.forAssistant,
      { userId },
    )
    try {
      const offer = await lookupVariant(found.variantId, country ?? undefined)
      const say = await ctx.runMutation(
        components.shopping.watches.recordCheck,
        {
          id: found._id,
          // Out of stock isn't gone: keep watching at the last price.
          price: !offer
            ? null
            : offer.available
              ? offer.price
              : found.lastPrice,
        },
      )
      if (say) {
        // It dropped or went: the watch is over.
        await saveMessage(ctx, components.agent, {
          threadId: say.threadId,
          message: { role: 'assistant', content: say.message },
        })
        return null
      }
    } catch (error) {
      // A failed lookup is tried again at the next check.
      console.error(error)
    }
    await ctx.scheduler.runAfter(
      WATCH_EVERY_MS,
      internal.api.shopping.checkWatch,
      {
        userId,
        id,
      },
    )
    return null
  },
})

export const shoppingApi = {
  details,
  saveDetails,
  forAssistant,
  addToCart,
  cart,
  setQuantity,
  clearShop,
  startWatch,
  watch,
  stopWatch,
  checkWatch,
}
