/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as api_auth from "../api/auth.js";
import type * as api_users from "../api/users.js";
import type * as lib_functions from "../lib/functions.js";
import type * as models_users_auth from "../models/users/auth.js";
import type * as models_users_functions from "../models/users/functions.js";
import type * as models_users_table from "../models/users/table.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "api/auth": typeof api_auth;
  "api/users": typeof api_users;
  "lib/functions": typeof lib_functions;
  "models/users/auth": typeof models_users_auth;
  "models/users/functions": typeof models_users_functions;
  "models/users/table": typeof models_users_table;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authEmail: import("@convex-dev/auth/components/email/_generated/component.js").ComponentApi<"authEmail">;
  authGoogle: import("@convex-dev/auth/components/google/_generated/component.js").ComponentApi<"authGoogle">;
  authGithub: import("@convex-dev/auth/components/github/_generated/component.js").ComponentApi<"authGithub">;
};
