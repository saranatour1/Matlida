# Features

Where each Matilda feature lives, and the last merged PR that changed it. Read this before searching the code: find the section, open the files it names, and follow the `file:symbol` references. The `features` skill says how to bring it up to date after a merge.

Mapped through: [#171](https://github.com/saranatour1/Matlida/pull/171)

## How the code is laid out

| Where                                                                           | What goes there                                                                                                                                                  |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convex/models/<table>/`                                                        | One folder per table: `table.ts` (schema), `functions.ts` (Convex functions, collected in a `<table>Api` object), `queries.ts` (helpers other models read with). |
| `convex/api/<table>.ts`                                                         | Re-exports `<table>Api`. The frontend calls `api.api.<table>.<fn>`. Never put logic here.                                                                        |
| `convex/components/<name>/`                                                     | A self-contained feature with its own tables (shopping, study).                                                                                                  |
| `convex/lib/`                                                                   | Code shared across models: AI models, budget, Jev decisions, SIP/RTP, Photon, time.                                                                              |
| `convex/models/threads/`                                                        | The assistant itself: chat, its tools (`tools.ts`, `everyday.ts`, `pages.ts`, `shopping.ts`, `study.ts`), voice and in-app calls.                                |
| `convex/schema.ts`, `http.ts`, `crons.ts`, `convex.config.ts`, `auth.config.ts` | Config only. Webhook routes are in `http.ts`; the one timed job is in `crons.ts`.                                                                                |
| `src/routes/`                                                                   | File routes. `_auth/` is signed-out pages, `_app/` is the signed-in app, `_app/p/$projectId/` is one workspace, `api/` is Worker endpoints.                      |
| `src/components/*-part.tsx`                                                     | A chat card, one per tool result (`chart-part.tsx` for `show_chart`).                                                                                            |
| `src/components/ui/`                                                            | shadcn components. Not feature code.                                                                                                                             |
| `convex/tests/<table>/`, `src/tests/`                                           | Tests, mirroring the folders above.                                                                                                                              |

## Sign-in and accounts

Email and password with verification and reset, Google and GitHub. Production offers GitHub only.

Paths: `convex/models/users/` `convex/lib/authMethods.ts` `src/routes/_auth/` `src/components/auth-page.tsx` `src/components/oauth-buttons.tsx` `src/components/account-form.tsx` `src/components/identify-user.tsx` `src/lib/auth.ts` `src/hooks/use-sign-in-methods.ts`
Last PR: [#165](https://github.com/saranatour1/Matlida/pull/165) Run scheduled work when it's due, not on crons · changed 2026-10-23 · merged 2026-10-23

- Every sign-in function (sign-up, password recovery, Google, GitHub): `convex/models/users/auth.ts:authApi`.
- Which methods a deployment offers: `AUTH_METHODS`, read by `convex/lib/authMethods.ts:enabledMethods`, shown by `src/hooks/use-sign-in-methods.ts:useSignInMethods`.
- First sign-in creates the user and their first workspace: `convex/models/users/functions.ts:createUser`. Every later sign-in runs `syncProfile`.
- Turning check-in calls on or off: `convex/models/users/functions.ts:setCheckIns`.
- Recipes for driving these in a browser: `.claude/skills/verify-matlida/features/`.

## Workspaces and assistants

A workspace (project) has a lead assistant (Matilda by default) and bots. Each has instructions, a model, a portrait, and notes on its text.

Paths: `convex/models/projects/` `convex/models/bots/` `convex/models/comments/` `convex/lib/portraits.ts` `src/routes/_app/projects.tsx` `src/routes/_app/route.tsx` `src/routes/_app/p/$projectId/bots.tsx` `src/routes/_app/p/$projectId/settings.tsx` `src/components/app-sidebar.tsx` `src/components/project-form.tsx` `src/components/new-assistant-dialog.tsx` `src/components/bot-avatar.tsx` `src/components/bot-part.tsx` `src/components/thread-members.tsx` `src/components/markdown-editor.tsx` `src/lib/bot-template.ts` `src/lib/bot-templates.ts` `src/lib/rules.ts` `src/hooks/use-project.ts`
Last PR: [#170](https://github.com/saranatour1/Matlida/pull/170) KV query snapshots, add_to_list write-conflict fix, tsrs and oxfmt · changed 2026-10-23 · merged 2026-10-23

- Creating and editing a workspace: `convex/models/projects/functions.ts:save`. What's on your plate today (`get_today`): `convex/models/projects/functions.ts:today`.
- Bots, copies and templates: `convex/models/bots/functions.ts:duplicate`, `fromOtherProjects`, and the ready-made ones in `src/lib/bot-templates.ts`.
- Who an assistant can hand work to (`ask_bot`): `convex/models/threads/functions.ts:setMembers`, used by `convex/models/threads/lead.ts:askTools`.
- Notes on instructions in the editor: `convex/models/comments/` and `src/components/markdown-editor.tsx`.

## Chat and replies

One chat per assistant. Messages with attachments, streamed replies, stop and redo, a model and effort per chat, and every tool the assistant can call.

Paths: `convex/models/threads/chat.ts` `convex/models/threads/functions.ts` `convex/models/threads/queries.ts` `convex/models/threads/lead.ts` `convex/models/threads/tools.ts` `convex/lib/ai.ts` `convex/lib/models.ts` `convex/lib/attachments.ts` `src/routes/_app/p/$projectId/index.tsx` `src/routes/_app/p/$projectId/models.tsx` `src/components/chat.tsx` `src/components/chat-message.tsx` `src/components/prompt-form.tsx` `src/components/assistant-panel.tsx` `src/components/model-menu.tsx` `src/components/model-select.tsx` `src/components/effort-menu.tsx` `src/components/copy-button.tsx` `src/components/suggestions.tsx` `src/components/tool-part.tsx` `src/components/image-part.tsx` `src/hooks/use-upload.ts`
Last PR: [#170](https://github.com/saranatour1/Matlida/pull/170) KV query snapshots, add_to_list write-conflict fix, tsrs and oxfmt · changed 2026-10-23 · merged 2026-10-23

- Sending a message and scheduling the reply: `convex/models/threads/chat.ts:sendMessage`, then `runReply` streams it.
- Stopping a reply, and unsticking one that died: `convex/models/threads/chat.ts:stop`. Retry or edit: `redo`.
- The agent for one reply (model, budget, instructions, tools): `convex/models/threads/lead.ts:createAgent`.
- The list of tools every assistant gets: `convex/models/threads/tools.ts:assistantTools`. A new tool goes here, or in the topic's file next to it.
- Models offered, and which model does each job: `convex/lib/models.ts:MODELS`, `CHAT_MODELS`, `JOBS`. Per-chat model and effort: `convex/models/threads/functions.ts:setModel`, `setEffort`.
- Which attachments a model can take: `convex/lib/attachments.ts:attachable`.

## Voice and calls

Talking to an assistant in the app, and assistants phoning a number over SIP through Photon.

Paths: `convex/models/threads/voice.ts` `convex/models/threads/calls.ts` `convex/models/calls/` `convex/lib/audio.ts` `convex/lib/sentences.ts` `convex/lib/transcript.ts` `convex/lib/sip.ts` `convex/lib/rtp.ts` `convex/lib/phone.ts` `src/components/voice-call.tsx` `src/components/voice-button.tsx` `src/components/incoming-call.tsx` `src/components/call-history.tsx` `src/lib/turn-taking.ts` `src/lib/ring-alert.ts` `src/lib/wav.ts` `src/hooks/use-call-settings.ts` `public/loudness-worklet.js`
Last PR: [#171](https://github.com/saranatour1/Matlida/pull/171) In-app calls: connect without waiting on speech, listen in background tabs, notify on rings · changed 2026-10-23 · merged 2026-10-23

- **In-app call turn**: the browser hears you, then `convex/models/threads/calls.ts:startTurn` starts a workflow (`runTurn`): `hearStep` transcribes, `replyStep` or `fastStep` (Fast voice) answers, and the reply is spoken sentence by sentence (`convex/lib/sentences.ts:takePieces`). A newer turn cancels one still running (`isCurrent`). Speech that takes longer than `SPEECH_TIMEOUT_MS` gives up.
- **Who talks when in the app**: loudness only, in `src/lib/turn-taking.ts`, read from `public/loudness-worklet.js` so it keeps working in a background tab. Talking over the assistant pauses it, but her own voice coming back through the speakers doesn't (`src/lib/turn-taking.ts:ECHO_RATIO`). Don't swap in a VAD library; tune the loudness check.
- **Call bar, settings and volume**: `src/components/voice-call.tsx:VoiceBar`, `CallSettings`, `VolumeBar`. Settings are kept in the browser by `src/hooks/use-call-settings.ts`.
- **Phone calls**: the `call_phone` tool in `convex/models/threads/tools.ts` checks the `phoneCalls` flag (see Platform) and that you typed the number, then `convex/models/calls/dial.ts:dial` places it with `placeCall`.
- **When a phone call hangs up** (all in `convex/models/calls/dial.ts:placeCall`):
  - the reply ends in "goodbye" (`goodbye`);
  - Jev says the call has done its job (`isOver`, which asks `convex/lib/decide.ts:callIsOver`, at `JEV_THRESHOLDS.hangUp`);
  - you press Hang up (`convex/models/calls/functions.ts:hangUpPhone` sets `phone.hangUp`, checked every couple of seconds by `hangUp`);
  - the line drops, it goes quiet (`QUIET_MS`), or it reaches `MAX_CALL_MS` (9 minutes). Unanswered after `RING_MS`, it stops ringing.
- **Call history and transcripts**: `convex/models/calls/functions.ts:history`, `transcript`; `src/components/call-history.tsx:CallHistory`. Debug the latest call with `pnpm exec convex run api/calls:dump`.
- **Recording**: `convex/lib/rtp.ts:recorder`, started in `dial`.
- **Phone numbers on screen** show their last 4 digits: `convex/lib/phone.ts:maskNumber`.
- **Rings in another tab**: `src/lib/ring-alert.ts` asks for notifications; `src/components/incoming-call.tsx:IncomingCall` shows a ringing reminder or check-in.

## Reminders and check-ins

Reminders by chat, text, email or a ring, recurring on crons. Check-in calls when Jev thinks something is owed.

Paths: `convex/models/reminders/` `src/lib/reminders.ts`
Last PR: [#165](https://github.com/saranatour1/Matlida/pull/165) Run scheduled work when it's due, not on crons · changed 2026-10-23 · merged 2026-10-23

- Setting one (`set_reminder`): `convex/models/reminders/functions.ts:schedule`. Delivering it when due: `fire`.
- Recurring reminders: `register` and `cronFor`. Jev stops or pauses one that's no longer needed: `recurringVia`, then `settle`.
- Ringing in the app: `ring`, `pickUp`, `snooze`. Nobody picked up: `miss`, where Jev decides whether to call again (`convex/lib/decide.ts:afterMissedCall`).
- A message to a contact waits for your OK: `confirm`, `allowContactMessage`, `emailContact`.
- Check-in calls, about 3 hours after you last chat: `convex/models/reminders/checkIns.ts:run`, asking `convex/lib/decide.ts:shouldCallNow`. At most 3 a day (`call`).

## Jev decisions and the feedback loop

Jev answers yes/no and pick-one questions that code acts on. Every answer is kept to tune the thresholds.

Paths: `convex/lib/decide.ts` `convex/models/judgments/`
Last PR: [#154](https://github.com/saranatour1/Matlida/pull/154) Record phone calls, and hang up once the call has done its job · changed 2026-10-22 · merged 2026-10-22

- Every threshold in one place: `convex/lib/decide.ts:JEV_THRESHOLDS`. Move one only after reading the spread: `pnpm exec convex run api/judgments:summary '{"kind":"check_in"}'` (`convex/models/judgments/functions.ts:summary`).
- The questions: `decide` (the `/decide` command), `needsFollowUp`, `whoShouldHandle`, `checkRecurring`, `shouldCallNow`, `callIsOver`, `gradeAnswer`.

## Email

Each person can claim `handle@MAIL_DOMAIN`. Email arrives through Photon, shows in the lead's chat, and you send the reply yourself.

Paths: `convex/models/emails/` `convex/models/mailboxes/` `convex/lib/mail.ts` `convex/lib/handles.ts` `src/components/email-address.tsx` `src/components/email-reply.tsx`
Last PR: [#165](https://github.com/saranatour1/Matlida/pull/165) Run scheduled work when it's due, not on crons · changed 2026-10-23 · merged 2026-10-23

- Claiming an address: `convex/models/mailboxes/functions.ts:claim`, `release`. Handle rules: `convex/lib/handles.ts:parseHandle`.
- Checking for new mail (`check_email`, `find_emails`, and the webhook): `convex/models/emails/functions.ts:poll`, `receive`.
- Replying once however many clicks: `reply`, guarded by `claimReply`.
- Sending through Photon: `convex/lib/photon.ts:sendEmail`, `replyByEmail`.

## Texting and Telegram

Telegram through Photon's webhook (text, commands and voice notes). The Spectrum SDK path for iMessage and WhatsApp is still in the code.

Paths: `convex/models/texts/` `convex/lib/photon.ts` `convex/lib/webhooks.ts` `convex/lib/limits.ts` `src/routes/_app/p/$projectId/messaging.tsx`
Last PR: [#167](https://github.com/saranatour1/Matlida/pull/167) Hear Telegram voice notes through Photon's webhook · changed 2026-10-23 · merged 2026-10-23

- Webhook: `POST /photon/webhook` in `convex/http.ts`, handled by `convex/models/texts/webhook.ts:photonWebhook`, recorded once by `convex/models/texts/functions.ts:received`.
- Linking a chat with a one-time code: `startLink`, `claim`.
- Answering: `replyOnPhoton`. Voice notes: `hear`.
- Rate limits on anything from outside: `convex/lib/limits.ts:rateLimiter`.
- Searching what you texted (`find_texts`): `convex/models/texts/functions.ts:search`.

## Connections and setup

One registry of every channel and what each still needs, plus `/setup` in the chat.

Paths: `convex/models/channels/` `convex/lib/channels.ts` `src/routes/_app/p/$projectId/connections.tsx` `src/components/setup-part.tsx`
Last PR: [#169](https://github.com/saranatour1/Matlida/pull/169) Read Flagship's no-calls flag for phone calls · changed 2026-10-23 · merged 2026-10-23

- The registry: `convex/lib/channels.ts:CHANNELS`. Status per project: `convex/models/channels/functions.ts:list`.
- The setup card (`show_setup`): `src/components/setup-part.tsx`. The human setup guide: `docs/setup/channels.md`.

## Contacts

People you message or call through the assistant.

Paths: `convex/models/contacts/` `src/routes/_app/p/$projectId/contacts.tsx`
Last PR: [#159](https://github.com/saranatour1/Matlida/pull/159) Contacts page: a table of people, with Email and Call · changed 2026-10-23 · merged 2026-10-23

- `save_contact` and `find_contact`: `convex/models/contacts/functions.ts:save`, `find`. The Contacts page: `put`, `list`.

## Commands and the Library

Built-in `/` commands, your own saved commands, and commands written by AI.

Paths: `convex/models/commands/` `convex/lib/commands.ts` `src/routes/_app/p/$projectId/library.tsx` `src/components/command-dialog.tsx` `src/components/command-menu.tsx` `src/components/commands-part.tsx`
Last PR: [#166](https://github.com/saranatour1/Matlida/pull/166) Run commands and hear voice notes on Telegram · changed 2026-10-23 · merged 2026-10-23

- Built-in commands: `convex/lib/commands.ts:BUILT_IN_COMMANDS`. A test checks the README table names each one, so add new commands to both.
- Saving and drafting: `convex/models/commands/functions.ts:save`, `draft`. Resolving `/name`: `convex/models/commands/queries.ts:resolveCommand`.
- Daily sweep of unsaved uploads: `sweepFiles`, the only job in `convex/crons.ts`.

## Plans and tasks

Saved plans, and `/run`, which works through a plan as a durable workflow with Start, Cancel and Try again.

Paths: `convex/models/plans/` `convex/models/tasks/` `convex/lib/workflow.ts` `src/components/task-card.tsx` `src/components/checklist-part.tsx`
Last PR: [#144](https://github.com/saranatour1/Matlida/pull/144) Add Databuddy analytics: page views, clicks, web vitals, errors, and typed product events · changed 2026-10-22 · merged 2026-10-22

- Plans and lists (`save_plan`, `add_to_list`): `convex/models/plans/functions.ts:write`, `addItems`.
- The workflow: `convex/models/tasks/functions.ts:runPlan`, one `doStep` at a time. Try again from the failed step: `retry`.

## Pages

Reports, memos and dashboards you edit together, refreshed on a schedule.

Paths: `convex/models/pages/` `convex/models/threads/pages.ts` `src/routes/_app/p/$projectId/pages/$pageId.tsx` `src/components/page-part.tsx` `src/components/page-metrics.tsx`
Last PR: [#165](https://github.com/saranatour1/Matlida/pull/165) Run scheduled work when it's due, not on crons · changed 2026-10-23 · merged 2026-10-23

- Tools: `write_page`, `read_page`, `keep_page_updated` in `convex/models/threads/pages.ts:pageTools`.
- Refresh schedule: `convex/models/pages/functions.ts:setRefresh`, `refreshOne`.

## Shopping

Products across Shopify stores, carts, checkout at the store, and price watches.

Paths: `convex/components/shopping/` `convex/models/shopping/` `convex/models/threads/shopping.ts` `convex/lib/shopify.ts` `src/components/cart-part.tsx` `src/components/products-part.tsx` `src/components/watch-part.tsx` `src/components/shopping-details-form.tsx` `src/lib/money.ts`
Last PR: [#166](https://github.com/saranatour1/Matlida/pull/166) Run commands and hear voice notes on Telegram · changed 2026-10-23 · merged 2026-10-23

- Tools: `convex/models/threads/shopping.ts:shoppingTools`. Search: `convex/lib/shopify.ts:searchProducts`.
- Cart: `convex/components/shopping/cart.ts`, checkout link: `convex/components/shopping/checkout.ts:checkoutLink`.
- Price watches, checked daily: `convex/components/shopping/watches.ts`, `convex/models/shopping/functions.ts:checkWatch`.

## Study

`/study` flash cards and `/quiz`, spaced repetition, and review calls that grade what you say.

Paths: `convex/components/study/` `convex/models/study/` `convex/models/threads/study.ts` `src/components/study-part.tsx`
Last PR: [#136](https://github.com/saranatour1/Matlida/pull/136) Land #134 and #135 on master: fewer subscriptions, sturdier frontend · changed 2026-10-22 · merged 2026-10-22

- Making a deck: `convex/models/study/functions.ts:makeDeck`. Grading: `grade`, and Jev for short answers: `checkAnswer`.
- Scheduling reviews: `convex/components/study/decks.ts:nextReview`.

## News

Choose what you follow, then get a daily briefing in the lead's chat.

Paths: `convex/models/news/` `convex/lib/news.ts` `src/components/news-part.tsx` `src/components/news-settings.tsx`
Last PR: [#165](https://github.com/saranatour1/Matlida/pull/165) Run scheduled work when it's due, not on crons · changed 2026-10-23 · merged 2026-10-23

- The daily briefing at your hour: `convex/models/news/functions.ts:sendDaily`, `postBriefing`, then `scheduleNext`.

## Everyday cards

The small commands that answer with a card: today, day plans, trips, splits, time zones, timers, tables, drafts, recipes, charts, post previews, problem checks, Convex docs.

Paths: `convex/models/threads/everyday.ts` `convex/lib/everyday.ts` `convex/lib/convexDocs.ts` `src/components/today-part.tsx` `src/components/split-part.tsx` `src/components/time-zones-part.tsx` `src/components/timeline-part.tsx` `src/components/timer-part.tsx` `src/components/table-part.tsx` `src/components/drafts-part.tsx` `src/components/recipe-part.tsx` `src/components/chart-part.tsx` `src/components/post-preview-part.tsx` `src/components/problem-check-part.tsx` `src/lib/amounts.ts`
Last PR: [#170](https://github.com/saranatour1/Matlida/pull/170) KV query snapshots, add_to_list write-conflict fix, tsrs and oxfmt · changed 2026-10-23 · merged 2026-10-23

- Tools: `convex/models/threads/everyday.ts:everydayTools`. A new card is a tool here plus a `src/components/<name>-part.tsx`.
- Live Convex docs for `/convex` and `/fix`: `convex/lib/convexDocs.ts:searchConvexDocs`.

## Pictures and videos

`/image` and `/video`, made in the background and saved in Convex storage.

Paths: `convex/models/videos/` `src/components/video-part.tsx`
Last PR: [#136](https://github.com/saranatour1/Matlida/pull/136) Land #134 and #135 on master: fewer subscriptions, sturdier frontend · changed 2026-10-22 · merged 2026-10-22

- Videos: `convex/models/videos/functions.ts:start`, then `convex/models/videos/make.ts:make`. Pictures are the `generate_image` tool in `convex/models/threads/tools.ts`.

## AI budget and usage

A monthly AI budget per person, metered on every model call.

Paths: `convex/lib/budget.ts` `convex/models/usage/`
Last PR: [#121](https://github.com/saranatour1/Matlida/pull/121) Land #103–#119 on master · changed 2026-10-22 · merged 2026-10-22

- Every model call goes through `convex/lib/budget.ts:budgetedModel` (chat) or `metered` (everything else). The cap: `AI_BUDGET_USD`, default in `BUDGET_USD`.
- Spend per chat and per month: `convex/models/usage/functions.ts:forThread`, `budget`.

## Platform

Hosting on Cloudflare Workers, feature flags, analytics, the landing page, and cached query snapshots.

Paths: `convex/lib/flags.ts` `src/routes/api/` `src/routes/__root.tsx` `src/routes/index.tsx` `src/router.tsx` `src/cloudflare.d.ts` `src/lib/analytics.ts` `src/lib/site.ts` `src/lib/snapshots.ts` `src/lib/query-snapshots.ts`
Last PR: [#170](https://github.com/saranatour1/Matlida/pull/170) KV query snapshots, add_to_list write-conflict fix, tsrs and oxfmt · changed 2026-10-23 · merged 2026-10-23

- Feature flags: `convex/lib/flags.ts:FLAGS`, read by `flagOn` through the Worker's `src/routes/api/flags.ts`. Phone calls stay off unless Flagship's `no-calls` is off for the user.
- Query snapshots in KV, so pages show your last result at once: `src/lib/query-snapshots.ts`, served by `src/routes/api/snapshot.ts`.
- Analytics events: `src/lib/analytics.ts`. SEO and the landing page: `src/lib/site.ts`, `src/routes/index.tsx`.
- Deploying: `wrangler.jsonc` and README's "Deploying to Cloudflare".

## Shared code

Not a feature. Helpers many features use.

Paths: `convex/lib/ctx.ts` `convex/lib/functions.ts` `convex/lib/time.ts` `src/lib/attempt.ts` `src/lib/errors.ts` `src/hooks/use-mobile.ts` `src/hooks/use-now.ts` `src/components/form-field.tsx` `src/components/card-skeleton.tsx` `src/components/error-screen.tsx` `src/styles/`
Last PR: [#136](https://github.com/saranatour1/Matlida/pull/136) Land #134 and #135 on master: fewer subscriptions, sturdier frontend · changed 2026-10-22 · merged 2026-10-22

- Signed-in functions (`ctx.userId`): `convex/lib/functions.ts:authedQuery`, `authedMutation`, `zAuthedMutation`.
- All date and time math: `convex/lib/time.ts`. Never `new Date()`.

## Where the next features go

From README's "What's next", in its order, and where each would land:

- **Approval steps in workflows**: a step that waits on your OK in `convex/models/tasks/functions.ts:runPlan`, like its Start event (`startEvent`).
- **Commands that start a workflow**: `convex/lib/commands.ts` plus a workflow in `convex/models/tasks/`.
- **Per-step model and effort**: `convex/models/tasks/functions.ts:doStep`.
- **Project loop** (a recurring review that writes a weekly report page): the recurring path in `convex/models/reminders/` and a page from `convex/models/pages/`.
- **Pinned cards and per-project layouts**: `convex/models/projects/` and `src/routes/_app/p/$projectId/index.tsx`.
- **Thumbs up or down on replies**: a new table under `convex/models/` beside `judgments`, and the message actions in `src/components/chat-message.tsx`.
- **Moving thresholds from outcomes**: `convex/lib/decide.ts:JEV_THRESHOLDS`, using `convex/models/judgments/functions.ts:summary`.

A new feature is real when it has a section here: its own paths, at least one `file:symbol` entry point, and a merged PR. Code that fits an existing section joins it; a new table gets a new folder under `convex/models/` and, usually, a new section.
