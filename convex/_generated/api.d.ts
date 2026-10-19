/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _workaround from "../_workaround.js";
import type * as api_auth from "../api/auth.js";
import type * as api_bots from "../api/bots.js";
import type * as api_chat from "../api/chat.js";
import type * as api_commands from "../api/commands.js";
import type * as api_projects from "../api/projects.js";
import type * as api_sender from "../api/sender.js";
import type * as api_threads from "../api/threads.js";
import type * as api_users from "../api/users.js";
import type * as http from "../http.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_functions from "../lib/functions.js";
import type * as models_bots_functions from "../models/bots/functions.js";
import type * as models_bots_table from "../models/bots/table.js";
import type * as models_commands_functions from "../models/commands/functions.js";
import type * as models_commands_table from "../models/commands/table.js";
import type * as models_projects_functions from "../models/projects/functions.js";
import type * as models_projects_table from "../models/projects/table.js";
import type * as models_texts_sender from "../models/texts/sender.js";
import type * as models_texts_spectrum from "../models/texts/spectrum.js";
import type * as models_threads_chat from "../models/threads/chat.js";
import type * as models_threads_functions from "../models/threads/functions.js";
import type * as models_threads_lead from "../models/threads/lead.js";
import type * as models_threads_table from "../models/threads/table.js";
import type * as models_users_auth from "../models/users/auth.js";
import type * as models_users_functions from "../models/users/functions.js";
import type * as models_users_table from "../models/users/table.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _workaround: typeof _workaround;
  "api/auth": typeof api_auth;
  "api/bots": typeof api_bots;
  "api/chat": typeof api_chat;
  "api/commands": typeof api_commands;
  "api/projects": typeof api_projects;
  "api/sender": typeof api_sender;
  "api/threads": typeof api_threads;
  "api/users": typeof api_users;
  http: typeof http;
  "lib/ai": typeof lib_ai;
  "lib/functions": typeof lib_functions;
  "models/bots/functions": typeof models_bots_functions;
  "models/bots/table": typeof models_bots_table;
  "models/commands/functions": typeof models_commands_functions;
  "models/commands/table": typeof models_commands_table;
  "models/projects/functions": typeof models_projects_functions;
  "models/projects/table": typeof models_projects_table;
  "models/texts/sender": typeof models_texts_sender;
  "models/texts/spectrum": typeof models_texts_spectrum;
  "models/threads/chat": typeof models_threads_chat;
  "models/threads/functions": typeof models_threads_functions;
  "models/threads/lead": typeof models_threads_lead;
  "models/threads/table": typeof models_threads_table;
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
  spectrum: import("@spectrum-ts/convex/_generated/component.js").ComponentApi<"spectrum">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authEmail: import("@convex-dev/auth/components/email/_generated/component.js").ComponentApi<"authEmail">;
  authGoogle: import("@convex-dev/auth/components/google/_generated/component.js").ComponentApi<"authGoogle">;
  authGithub: import("@convex-dev/auth/components/github/_generated/component.js").ComponentApi<"authGithub">;
};
