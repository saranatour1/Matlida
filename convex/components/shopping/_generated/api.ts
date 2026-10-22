/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cart from '../cart.js'
import type * as checkout from '../checkout.js'
import type * as details from '../details.js'
import type * as watches from '../watches.js'

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from 'convex/server'
import { anyApi, componentsGeneric } from 'convex/server'

const fullApi: ApiFromModules<{
  cart: typeof cart
  checkout: typeof checkout
  details: typeof details
  watches: typeof watches
}> = anyApi as any

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, 'public'>
> = anyApi as any

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, 'internal'>
> = anyApi as any

export const components = componentsGeneric() as unknown as {}
