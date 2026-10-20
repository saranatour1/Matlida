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
import type * as api_bots from "../api/bots.js";
import type * as api_calls from "../api/calls.js";
import type * as api_channels from "../api/channels.js";
import type * as api_chat from "../api/chat.js";
import type * as api_commands from "../api/commands.js";
import type * as api_comments from "../api/comments.js";
import type * as api_emails from "../api/emails.js";
import type * as api_mailboxes from "../api/mailboxes.js";
import type * as api_plans from "../api/plans.js";
import type * as api_projects from "../api/projects.js";
import type * as api_reminders from "../api/reminders.js";
import type * as api_sender from "../api/sender.js";
import type * as api_texts from "../api/texts.js";
import type * as api_threads from "../api/threads.js";
import type * as api_usage from "../api/usage.js";
import type * as api_users from "../api/users.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_channels from "../lib/channels.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_handles from "../lib/handles.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_mail from "../lib/mail.js";
import type * as lib_models from "../lib/models.js";
import type * as lib_photon from "../lib/photon.js";
import type * as lib_portraits from "../lib/portraits.js";
import type * as lib_sentences from "../lib/sentences.js";
import type * as lib_transcript from "../lib/transcript.js";
import type * as lib_webhooks from "../lib/webhooks.js";
import type * as models_bots_functions from "../models/bots/functions.js";
import type * as models_bots_table from "../models/bots/table.js";
import type * as models_calls_functions from "../models/calls/functions.js";
import type * as models_calls_table from "../models/calls/table.js";
import type * as models_channels_functions from "../models/channels/functions.js";
import type * as models_commands_functions from "../models/commands/functions.js";
import type * as models_commands_table from "../models/commands/table.js";
import type * as models_comments_functions from "../models/comments/functions.js";
import type * as models_comments_table from "../models/comments/table.js";
import type * as models_emails_functions from "../models/emails/functions.js";
import type * as models_emails_table from "../models/emails/table.js";
import type * as models_mailboxes_functions from "../models/mailboxes/functions.js";
import type * as models_mailboxes_table from "../models/mailboxes/table.js";
import type * as models_plans_functions from "../models/plans/functions.js";
import type * as models_plans_table from "../models/plans/table.js";
import type * as models_projects_functions from "../models/projects/functions.js";
import type * as models_projects_table from "../models/projects/table.js";
import type * as models_reminders_functions from "../models/reminders/functions.js";
import type * as models_reminders_table from "../models/reminders/table.js";
import type * as models_texts_functions from "../models/texts/functions.js";
import type * as models_texts_sender from "../models/texts/sender.js";
import type * as models_texts_spectrum from "../models/texts/spectrum.js";
import type * as models_texts_table from "../models/texts/table.js";
import type * as models_texts_webhook from "../models/texts/webhook.js";
import type * as models_threads_calls from "../models/threads/calls.js";
import type * as models_threads_chat from "../models/threads/chat.js";
import type * as models_threads_functions from "../models/threads/functions.js";
import type * as models_threads_lead from "../models/threads/lead.js";
import type * as models_threads_table from "../models/threads/table.js";
import type * as models_threads_tools from "../models/threads/tools.js";
import type * as models_usage_functions from "../models/usage/functions.js";
import type * as models_usage_table from "../models/usage/table.js";
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
  "api/bots": typeof api_bots;
  "api/calls": typeof api_calls;
  "api/channels": typeof api_channels;
  "api/chat": typeof api_chat;
  "api/commands": typeof api_commands;
  "api/comments": typeof api_comments;
  "api/emails": typeof api_emails;
  "api/mailboxes": typeof api_mailboxes;
  "api/plans": typeof api_plans;
  "api/projects": typeof api_projects;
  "api/reminders": typeof api_reminders;
  "api/sender": typeof api_sender;
  "api/texts": typeof api_texts;
  "api/threads": typeof api_threads;
  "api/usage": typeof api_usage;
  "api/users": typeof api_users;
  crons: typeof crons;
  http: typeof http;
  "lib/ai": typeof lib_ai;
  "lib/channels": typeof lib_channels;
  "lib/functions": typeof lib_functions;
  "lib/handles": typeof lib_handles;
  "lib/limits": typeof lib_limits;
  "lib/mail": typeof lib_mail;
  "lib/models": typeof lib_models;
  "lib/photon": typeof lib_photon;
  "lib/portraits": typeof lib_portraits;
  "lib/sentences": typeof lib_sentences;
  "lib/transcript": typeof lib_transcript;
  "lib/webhooks": typeof lib_webhooks;
  "models/bots/functions": typeof models_bots_functions;
  "models/bots/table": typeof models_bots_table;
  "models/calls/functions": typeof models_calls_functions;
  "models/calls/table": typeof models_calls_table;
  "models/channels/functions": typeof models_channels_functions;
  "models/commands/functions": typeof models_commands_functions;
  "models/commands/table": typeof models_commands_table;
  "models/comments/functions": typeof models_comments_functions;
  "models/comments/table": typeof models_comments_table;
  "models/emails/functions": typeof models_emails_functions;
  "models/emails/table": typeof models_emails_table;
  "models/mailboxes/functions": typeof models_mailboxes_functions;
  "models/mailboxes/table": typeof models_mailboxes_table;
  "models/plans/functions": typeof models_plans_functions;
  "models/plans/table": typeof models_plans_table;
  "models/projects/functions": typeof models_projects_functions;
  "models/projects/table": typeof models_projects_table;
  "models/reminders/functions": typeof models_reminders_functions;
  "models/reminders/table": typeof models_reminders_table;
  "models/texts/functions": typeof models_texts_functions;
  "models/texts/sender": typeof models_texts_sender;
  "models/texts/spectrum": typeof models_texts_spectrum;
  "models/texts/table": typeof models_texts_table;
  "models/texts/webhook": typeof models_texts_webhook;
  "models/threads/calls": typeof models_threads_calls;
  "models/threads/chat": typeof models_threads_chat;
  "models/threads/functions": typeof models_threads_functions;
  "models/threads/lead": typeof models_threads_lead;
  "models/threads/table": typeof models_threads_table;
  "models/threads/tools": typeof models_threads_tools;
  "models/usage/functions": typeof models_usage_functions;
  "models/usage/table": typeof models_usage_table;
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
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authEmail: import("@convex-dev/auth/components/email/_generated/component.js").ComponentApi<"authEmail">;
  authGoogle: import("@convex-dev/auth/components/google/_generated/component.js").ComponentApi<"authGoogle">;
  authGithub: import("@convex-dev/auth/components/github/_generated/component.js").ComponentApi<"authGithub">;
};
