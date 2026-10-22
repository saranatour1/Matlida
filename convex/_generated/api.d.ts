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
import type * as api_contacts from "../api/contacts.js";
import type * as api_emails from "../api/emails.js";
import type * as api_mailboxes from "../api/mailboxes.js";
import type * as api_news from "../api/news.js";
import type * as api_pages from "../api/pages.js";
import type * as api_plans from "../api/plans.js";
import type * as api_projects from "../api/projects.js";
import type * as api_reminders from "../api/reminders.js";
import type * as api_shopping from "../api/shopping.js";
import type * as api_tasks from "../api/tasks.js";
import type * as api_texts from "../api/texts.js";
import type * as api_threads from "../api/threads.js";
import type * as api_usage from "../api/usage.js";
import type * as api_users from "../api/users.js";
import type * as api_videoMake from "../api/videoMake.js";
import type * as api_videos from "../api/videos.js";
import type * as api_voice from "../api/voice.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_audio from "../lib/audio.js";
import type * as lib_channels from "../lib/channels.js";
import type * as lib_commands from "../lib/commands.js";
import type * as lib_convexDocs from "../lib/convexDocs.js";
import type * as lib_decide from "../lib/decide.js";
import type * as lib_everyday from "../lib/everyday.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_handles from "../lib/handles.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_mail from "../lib/mail.js";
import type * as lib_models from "../lib/models.js";
import type * as lib_news from "../lib/news.js";
import type * as lib_photon from "../lib/photon.js";
import type * as lib_portraits from "../lib/portraits.js";
import type * as lib_sentences from "../lib/sentences.js";
import type * as lib_shopify from "../lib/shopify.js";
import type * as lib_transcript from "../lib/transcript.js";
import type * as lib_webhooks from "../lib/webhooks.js";
import type * as lib_workflow from "../lib/workflow.js";
import type * as models_bots_functions from "../models/bots/functions.js";
import type * as models_bots_table from "../models/bots/table.js";
import type * as models_calls_functions from "../models/calls/functions.js";
import type * as models_calls_table from "../models/calls/table.js";
import type * as models_channels_functions from "../models/channels/functions.js";
import type * as models_commands_functions from "../models/commands/functions.js";
import type * as models_commands_table from "../models/commands/table.js";
import type * as models_comments_functions from "../models/comments/functions.js";
import type * as models_comments_table from "../models/comments/table.js";
import type * as models_contacts_functions from "../models/contacts/functions.js";
import type * as models_contacts_table from "../models/contacts/table.js";
import type * as models_emails_functions from "../models/emails/functions.js";
import type * as models_emails_table from "../models/emails/table.js";
import type * as models_mailboxes_functions from "../models/mailboxes/functions.js";
import type * as models_mailboxes_table from "../models/mailboxes/table.js";
import type * as models_news_functions from "../models/news/functions.js";
import type * as models_news_table from "../models/news/table.js";
import type * as models_pages_functions from "../models/pages/functions.js";
import type * as models_pages_table from "../models/pages/table.js";
import type * as models_plans_functions from "../models/plans/functions.js";
import type * as models_plans_table from "../models/plans/table.js";
import type * as models_projects_functions from "../models/projects/functions.js";
import type * as models_projects_table from "../models/projects/table.js";
import type * as models_reminders_functions from "../models/reminders/functions.js";
import type * as models_reminders_table from "../models/reminders/table.js";
import type * as models_shopping_functions from "../models/shopping/functions.js";
import type * as models_shopping_table from "../models/shopping/table.js";
import type * as models_tasks_functions from "../models/tasks/functions.js";
import type * as models_tasks_table from "../models/tasks/table.js";
import type * as models_texts_functions from "../models/texts/functions.js";
import type * as models_texts_table from "../models/texts/table.js";
import type * as models_texts_webhook from "../models/texts/webhook.js";
import type * as models_threads_calls from "../models/threads/calls.js";
import type * as models_threads_chat from "../models/threads/chat.js";
import type * as models_threads_everyday from "../models/threads/everyday.js";
import type * as models_threads_functions from "../models/threads/functions.js";
import type * as models_threads_lead from "../models/threads/lead.js";
import type * as models_threads_pages from "../models/threads/pages.js";
import type * as models_threads_shopping from "../models/threads/shopping.js";
import type * as models_threads_table from "../models/threads/table.js";
import type * as models_threads_tools from "../models/threads/tools.js";
import type * as models_threads_voice from "../models/threads/voice.js";
import type * as models_usage_functions from "../models/usage/functions.js";
import type * as models_usage_table from "../models/usage/table.js";
import type * as models_users_auth from "../models/users/auth.js";
import type * as models_users_functions from "../models/users/functions.js";
import type * as models_users_table from "../models/users/table.js";
import type * as models_videos_functions from "../models/videos/functions.js";
import type * as models_videos_make from "../models/videos/make.js";
import type * as models_videos_table from "../models/videos/table.js";

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
  "api/contacts": typeof api_contacts;
  "api/emails": typeof api_emails;
  "api/mailboxes": typeof api_mailboxes;
  "api/news": typeof api_news;
  "api/pages": typeof api_pages;
  "api/plans": typeof api_plans;
  "api/projects": typeof api_projects;
  "api/reminders": typeof api_reminders;
  "api/shopping": typeof api_shopping;
  "api/tasks": typeof api_tasks;
  "api/texts": typeof api_texts;
  "api/threads": typeof api_threads;
  "api/usage": typeof api_usage;
  "api/users": typeof api_users;
  "api/videoMake": typeof api_videoMake;
  "api/videos": typeof api_videos;
  "api/voice": typeof api_voice;
  crons: typeof crons;
  http: typeof http;
  "lib/ai": typeof lib_ai;
  "lib/audio": typeof lib_audio;
  "lib/channels": typeof lib_channels;
  "lib/commands": typeof lib_commands;
  "lib/convexDocs": typeof lib_convexDocs;
  "lib/decide": typeof lib_decide;
  "lib/everyday": typeof lib_everyday;
  "lib/functions": typeof lib_functions;
  "lib/handles": typeof lib_handles;
  "lib/limits": typeof lib_limits;
  "lib/mail": typeof lib_mail;
  "lib/models": typeof lib_models;
  "lib/news": typeof lib_news;
  "lib/photon": typeof lib_photon;
  "lib/portraits": typeof lib_portraits;
  "lib/sentences": typeof lib_sentences;
  "lib/shopify": typeof lib_shopify;
  "lib/transcript": typeof lib_transcript;
  "lib/webhooks": typeof lib_webhooks;
  "lib/workflow": typeof lib_workflow;
  "models/bots/functions": typeof models_bots_functions;
  "models/bots/table": typeof models_bots_table;
  "models/calls/functions": typeof models_calls_functions;
  "models/calls/table": typeof models_calls_table;
  "models/channels/functions": typeof models_channels_functions;
  "models/commands/functions": typeof models_commands_functions;
  "models/commands/table": typeof models_commands_table;
  "models/comments/functions": typeof models_comments_functions;
  "models/comments/table": typeof models_comments_table;
  "models/contacts/functions": typeof models_contacts_functions;
  "models/contacts/table": typeof models_contacts_table;
  "models/emails/functions": typeof models_emails_functions;
  "models/emails/table": typeof models_emails_table;
  "models/mailboxes/functions": typeof models_mailboxes_functions;
  "models/mailboxes/table": typeof models_mailboxes_table;
  "models/news/functions": typeof models_news_functions;
  "models/news/table": typeof models_news_table;
  "models/pages/functions": typeof models_pages_functions;
  "models/pages/table": typeof models_pages_table;
  "models/plans/functions": typeof models_plans_functions;
  "models/plans/table": typeof models_plans_table;
  "models/projects/functions": typeof models_projects_functions;
  "models/projects/table": typeof models_projects_table;
  "models/reminders/functions": typeof models_reminders_functions;
  "models/reminders/table": typeof models_reminders_table;
  "models/shopping/functions": typeof models_shopping_functions;
  "models/shopping/table": typeof models_shopping_table;
  "models/tasks/functions": typeof models_tasks_functions;
  "models/tasks/table": typeof models_tasks_table;
  "models/texts/functions": typeof models_texts_functions;
  "models/texts/table": typeof models_texts_table;
  "models/texts/webhook": typeof models_texts_webhook;
  "models/threads/calls": typeof models_threads_calls;
  "models/threads/chat": typeof models_threads_chat;
  "models/threads/everyday": typeof models_threads_everyday;
  "models/threads/functions": typeof models_threads_functions;
  "models/threads/lead": typeof models_threads_lead;
  "models/threads/pages": typeof models_threads_pages;
  "models/threads/shopping": typeof models_threads_shopping;
  "models/threads/table": typeof models_threads_table;
  "models/threads/tools": typeof models_threads_tools;
  "models/threads/voice": typeof models_threads_voice;
  "models/usage/functions": typeof models_usage_functions;
  "models/usage/table": typeof models_usage_table;
  "models/users/auth": typeof models_users_auth;
  "models/users/functions": typeof models_users_functions;
  "models/users/table": typeof models_users_table;
  "models/videos/functions": typeof models_videos_functions;
  "models/videos/make": typeof models_videos_make;
  "models/videos/table": typeof models_videos_table;
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
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authEmail: import("@convex-dev/auth/components/email/_generated/component.js").ComponentApi<"authEmail">;
  authGoogle: import("@convex-dev/auth/components/google/_generated/component.js").ComponentApi<"authGoogle">;
  authGithub: import("@convex-dev/auth/components/github/_generated/component.js").ComponentApi<"authGithub">;
};
