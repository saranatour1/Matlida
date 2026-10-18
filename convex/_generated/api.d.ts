/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as artifacts from "../artifacts.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as emailConnections from "../emailConnections.js";
import type * as employees from "../employees.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_functions from "../lib/functions.js";
import type * as models_artifacts_functions from "../models/artifacts/functions.js";
import type * as models_artifacts_table from "../models/artifacts/table.js";
import type * as models_emailConnections_api from "../models/emailConnections/api.js";
import type * as models_emailConnections_functions from "../models/emailConnections/functions.js";
import type * as models_emailConnections_providers from "../models/emailConnections/providers.js";
import type * as models_emailConnections_smtp from "../models/emailConnections/smtp.js";
import type * as models_emailConnections_table from "../models/emailConnections/table.js";
import type * as models_employees_functions from "../models/employees/functions.js";
import type * as models_employees_table from "../models/employees/table.js";
import type * as models_projects_functions from "../models/projects/functions.js";
import type * as models_projects_table from "../models/projects/table.js";
import type * as models_threads_chat from "../models/threads/chat.js";
import type * as models_threads_functions from "../models/threads/functions.js";
import type * as models_threads_lead from "../models/threads/lead.js";
import type * as models_threads_table from "../models/threads/table.js";
import type * as models_users_functions from "../models/users/functions.js";
import type * as models_users_table from "../models/users/table.js";
import type * as projects from "../projects.js";
import type * as smtp from "../smtp.js";
import type * as threads from "../threads.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  artifacts: typeof artifacts;
  auth: typeof auth;
  chat: typeof chat;
  emailConnections: typeof emailConnections;
  employees: typeof employees;
  "lib/ai": typeof lib_ai;
  "lib/crypto": typeof lib_crypto;
  "lib/functions": typeof lib_functions;
  "models/artifacts/functions": typeof models_artifacts_functions;
  "models/artifacts/table": typeof models_artifacts_table;
  "models/emailConnections/api": typeof models_emailConnections_api;
  "models/emailConnections/functions": typeof models_emailConnections_functions;
  "models/emailConnections/providers": typeof models_emailConnections_providers;
  "models/emailConnections/smtp": typeof models_emailConnections_smtp;
  "models/emailConnections/table": typeof models_emailConnections_table;
  "models/employees/functions": typeof models_employees_functions;
  "models/employees/table": typeof models_employees_table;
  "models/projects/functions": typeof models_projects_functions;
  "models/projects/table": typeof models_projects_table;
  "models/threads/chat": typeof models_threads_chat;
  "models/threads/functions": typeof models_threads_functions;
  "models/threads/lead": typeof models_threads_lead;
  "models/threads/table": typeof models_threads_table;
  "models/users/functions": typeof models_users_functions;
  "models/users/table": typeof models_users_table;
  projects: typeof projects;
  smtp: typeof smtp;
  threads: typeof threads;
  users: typeof users;
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
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authUsername: import("@convex-dev/auth/components/username/_generated/component.js").ComponentApi<"authUsername">;
};
