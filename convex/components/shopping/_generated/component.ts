/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from 'convex/server'

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    cart: {
      add: FunctionReference<
        'mutation',
        'internal',
        {
          offer: {
            available: boolean
            currency: string
            image?: string
            listPrice?: number
            price: number
            productId: string
            rating?: number
            ratingCount?: number
            seller: string
            shop: string
            title: string
            url?: string
            variantId: string
            variantNumber: string
            variantTitle?: string
          }
          quantity: number
          userId: string
        },
        null,
        Name
      >
      clearShop: FunctionReference<
        'mutation',
        'internal',
        { shop: string; userId: string },
        null,
        Name
      >
      list: FunctionReference<
        'query',
        'internal',
        { userId: string },
        {
          hasDetails: boolean
          shops: Array<{
            checkoutUrl: string
            currency: string
            items: Array<{
              _creationTime: number
              _id: string
              currency: string
              image?: string
              price: number
              productId: string
              quantity: number
              seller: string
              shop: string
              title: string
              url?: string
              userId: string
              variantId: string
              variantNumber: string
              variantTitle?: string
            }>
            seller: string
            shop: string
            subtotal: number
          }>
        },
        Name
      >
      setQuantity: FunctionReference<
        'mutation',
        'internal',
        { id: string; quantity: number; userId: string },
        null,
        Name
      >
    }
    details: {
      get: FunctionReference<
        'query',
        'internal',
        { userId: string },
        {
          _creationTime: number
          _id: string
          address1: string
          address2?: string
          city: string
          country: string
          email: string
          firstName: string
          lastName: string
          notes?: string
          province?: string
          userId: string
          zip: string
        } | null,
        Name
      >
      save: FunctionReference<
        'mutation',
        'internal',
        {
          address1: string
          address2?: string
          city: string
          country: string
          email: string
          firstName: string
          lastName: string
          notes?: string
          province?: string
          userId: string
          zip: string
        },
        null,
        Name
      >
    }
    watches: {
      due: FunctionReference<
        'query',
        'internal',
        {},
        Array<{
          _creationTime: number
          _id: string
          checkedAt: number
          currency: string
          lastPrice: number
          projectId: string
          status: 'watching' | 'dropped' | 'gone' | 'stopped'
          target: number
          threadId: string
          title: string
          url?: string
          userId: string
          variantId: string
          variantTitle?: string
        }>,
        Name
      >
      get: FunctionReference<
        'query',
        'internal',
        { id: string; userId: string },
        {
          _creationTime: number
          _id: string
          checkedAt: number
          currency: string
          lastPrice: number
          projectId: string
          status: 'watching' | 'dropped' | 'gone' | 'stopped'
          target: number
          threadId: string
          title: string
          url?: string
          userId: string
          variantId: string
          variantTitle?: string
        } | null,
        Name
      >
      recordCheck: FunctionReference<
        'mutation',
        'internal',
        { id: string; price: number | null },
        { message: string; threadId: string } | null,
        Name
      >
      start: FunctionReference<
        'mutation',
        'internal',
        {
          offer: {
            available: boolean
            currency: string
            image?: string
            listPrice?: number
            price: number
            productId: string
            rating?: number
            ratingCount?: number
            seller: string
            shop: string
            title: string
            url?: string
            variantId: string
            variantNumber: string
            variantTitle?: string
          }
          projectId: string
          target: number
          threadId: string
          userId: string
        },
        string,
        Name
      >
      stop: FunctionReference<
        'mutation',
        'internal',
        { id: string; userId: string },
        null,
        Name
      >
    }
  }
