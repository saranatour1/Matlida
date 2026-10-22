import { createTool } from '@convex-dev/agent'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import {
  lookupVariant,
  productOptions,
  searchProducts,
} from '../../lib/shopify'
import { addToCartFor } from '../shopping/functions'
import type { ToolCtx } from '@convex-dev/agent'
import type { Offer } from '../../lib/shopify'
import type { Doc } from '../../lib/ctx'

/** An offer as the model and the cards see it: prices in major units. */
function shown(offer: Offer) {
  return {
    productId: offer.productId,
    variantId: offer.variantId,
    title: offer.title,
    variantTitle: offer.variantTitle,
    image: offer.image,
    url: offer.url,
    price: offer.price / 100,
    listPrice: offer.listPrice && offer.listPrice / 100,
    currency: offer.currency,
    available: offer.available,
    rating: offer.rating,
    ratingCount: offer.ratingCount,
    seller: offer.seller,
  }
}

/**
 * Shopping across Shopify stores for the project's owner: search, pick a
 * size or color, add to their cart. Nothing is paid here: the cart's Buy
 * button opens the store's checkout with their details filled in.
 */
export function shoppingTools(project: Doc<'projects'>) {
  const buyer = (ctx: ToolCtx) =>
    ctx.runQuery(internal.api.shopping.forAssistant, {
      userId: project.ownerId,
    }) as Promise<{ country: string | null; notes: string | null }>
  return {
    find_products: createTool({
      description:
        "Search products across Shopify stores, with real prices, ratings and stock, that ship to the user. The chat shows them as cards with Add to cart. It also returns the user's sizes and preferences (`notes`): follow them.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(200),
        maxPrice: z
          .number()
          .positive()
          .optional()
          .describe('In the currency of their country, like 50 for $50.'),
        minRating: z.number().min(1).max(5).optional(),
        limit: z.number().int().min(1).max(8).optional(),
      }),
      execute: async (ctx, { query, maxPrice, minRating, limit = 6 }) => {
        const { country, notes } = await buyer(ctx)
        const offers = await searchProducts({
          query,
          country: country ?? undefined,
          maxPrice: maxPrice && Math.round(maxPrice * 100),
          minRating,
          limit,
        })
        return {
          query,
          shipsTo: country,
          notes,
          products: offers.map(shown),
        }
      },
    }),
    product_options: createTool({
      description:
        "A product's sizes, colors and other options, and the variants matching a selection, to find the exact variant to add to the cart.",
      inputSchema: z.object({
        productId: z.string().describe('From find_products.'),
        selected: z
          .array(z.object({ name: z.string(), label: z.string() }))
          .max(5)
          .optional()
          .describe('Like [{"name":"Size","label":"10"}].'),
      }),
      execute: async (ctx, { productId, selected = [] }) => {
        const { country } = await buyer(ctx)
        const product = await productOptions(
          productId,
          selected,
          country ?? undefined,
        )
        return {
          title: product.title,
          options: product.options.map((o) => ({
            name: o.name,
            values: o.values.map((value) => value.label),
          })),
          variants: product.variants.slice(0, 20).map(shown),
        }
      },
    }),
    add_to_cart: createTool({
      description:
        "Add a variant to the user's cart at its current price. The chat shows the cart, with a Buy button per store that opens the store's checkout with their details filled in; they pay there. Never say you bought or paid for anything.",
      inputSchema: z.object({
        variantId: z
          .string()
          .describe('From find_products or product_options.'),
        quantity: z.number().int().min(1).max(20).optional(),
      }),
      execute: async (ctx, { variantId, quantity = 1 }) =>
        shown(await addToCartFor(ctx, project.ownerId, variantId, quantity)),
    }),
    watch_price: createTool({
      description:
        "Watch an item's price and tell the user in this chat when it's at or under `below`. It's checked about once a day. Use the variantId from find_products or product_options.",
      inputSchema: z.object({
        variantId: z.string(),
        below: z
          .number()
          .positive()
          .describe("In the item's currency, like 30 for $30."),
      }),
      execute: async (ctx, { variantId, below }) => {
        if (!ctx.threadId) throw new Error('Watches need a chat.')
        const { country } = await buyer(ctx)
        const offer = await lookupVariant(variantId, country ?? undefined)
        if (!offer) throw new Error('That item isn’t in the catalog.')
        const watchId: string = await ctx.runMutation(
          internal.api.shopping.startWatch,
          {
            userId: project.ownerId,
            projectId: project._id,
            threadId: ctx.threadId,
            offer,
            target: Math.round(below * 100),
          },
        )
        return {
          watchId,
          ...shown(offer),
          below,
          alreadyBelow: offer.price <= Math.round(below * 100),
        }
      },
    }),
    show_cart: createTool({
      description:
        "Show the user's cart: what's in it from each store, the totals, and a Buy button per store.",
      inputSchema: z.object({}),
      execute: () => Promise.resolve({ shown: true }),
    }),
  }
}
