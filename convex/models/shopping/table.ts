import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Your details for buying things: filled into a store's checkout when you
 * press Buy. No card or payment details: you pay on the store's checkout.
 */
export const shoppingDetailsTable = defineTable({
  userId: v.id('users'),
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  address1: v.string(),
  address2: v.optional(v.string()),
  city: v.string(),
  province: v.optional(v.string()),
  zip: v.string(),
  /** ISO 3166-1 alpha-2, like US or AE. Searches only show what ships there. */
  country: v.string(),
  /** Sizes, brands you like, things to avoid. The assistants read it when they shop. */
  notes: v.optional(v.string()),
}).index('by_user', ['userId'])

/** What you're about to buy, one row per variant, checked against the catalog when it's added. */
export const cartItemsTable = defineTable({
  userId: v.id('users'),
  variantId: v.string(),
  variantNumber: v.string(),
  productId: v.string(),
  title: v.string(),
  variantTitle: v.optional(v.string()),
  image: v.optional(v.string()),
  url: v.optional(v.string()),
  /** Minor units, like cents. */
  price: v.number(),
  currency: v.string(),
  quantity: v.number(),
  seller: v.string(),
  /** The store's origin, where its checkout is. */
  shop: v.string(),
}).index('by_user_and_variant', ['userId', 'variantId'])

/** An item you're waiting to drop below a price. Checked daily; the chat hears when it does. */
export const priceWatchesTable = defineTable({
  userId: v.id('users'),
  projectId: v.id('projects'),
  /** The chat to post in when it drops. */
  threadId: v.string(),
  variantId: v.string(),
  title: v.string(),
  variantTitle: v.optional(v.string()),
  url: v.optional(v.string()),
  currency: v.string(),
  /** Minor units: tell the user once the price is at or under this. */
  target: v.number(),
  /** Minor units, as of `checkedAt`. */
  lastPrice: v.number(),
  checkedAt: v.number(),
  /** `dropped`: it hit the target. `gone`: the store stopped selling it. */
  status: literals('watching', 'dropped', 'gone', 'stopped'),
}).index('by_status_and_checkedAt', ['status', 'checkedAt'])
