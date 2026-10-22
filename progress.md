# Progress

## 2026-10-18

### Built

- **Logo**: the kite sketch redrawn as `public/logo.svg` (64×64, stroke only, dark strokes in light mode and light strokes in dark mode). Used as the SVG favicon and on the auth pages in place of the placeholder icon.
- **Icons**: `favicon.ico` (16/32/48), `apple-touch-icon.png` and the two Android icons, rendered from the logo on white. The TanStack starter icons and the unused `favicon-16x16.png`, `favicon-32x32.png` and `favicon.png` are gone.
- **OG image**: `public/og.png` (1200×630): logo, "Matilda" in Geist and the tagline.
- **Head** (`src/routes/__root.tsx`): description, `og:*` and `twitter:*` tags. `og:image` is prefixed with `VITE_SITE_URL` when it's set.
- **README**: bio, what's built, stack, setup, env vars, scripts.

### Verified

- `pnpm lint` (typecheck + ESLint) passes.
- On the dev server, all meta tags render and `/logo.svg`, `/og.png`, `/favicon.ico`, `/apple-touch-icon.png` and `/site.webmanifest` return 200. The logo switches to light strokes under dark mode.
- Found that TanStack's `HeadContent` keeps only one meta per `name`, so the two media-scoped `theme-color` tags were dropped.

### Logo v2: kite chat bubble

- Designed in Paper (file "Matilda — Logo"). There are three directions: A has dotted spar, B the sketch's spar, C typing dots. It also has light and dark lockups and 32/16px previews.
- Picked C: the kite body is a speech bubble with three rounded corners, the sharp fourth corner is the tail, and the kite string runs from it. Three level typing dots sit inside. A was dropped because diagonal dots in a rounded square read as a die.
- Stroke went from 3.5 to 4.5 so the mark holds at 16–32px.
- `public/logo.svg`, every icon PNG, `favicon.ico` and `og.png` were re-rendered from it. Checked in light and dark mode with headless Chrome.

### Logo v2.1: diagonal dots

- The three typing dots now run diagonally at 45°, falling left to right (`transform="rotate(45 26.4 28)"` on the dots group in `public/logo.svg`).
- `favicon.ico`, `apple-touch-icon.png`, both Android icons and `og.png` were re-rendered to match.

### Vendored shadcn CSS (Dependabot #1)

- `shadcn` was a devDependency only so `app.css` could import `shadcn/tailwind.css`, and it pulled in `braces@3.0.3` (high-severity DoS, no patched release). That file now lives at `src/styles/shadcn.css` and the dependency is gone, along with braces.
- Run the CLI with `pnpm dlx shadcn@latest add <component>`.

### Assistants sidebar (2026-10-19)

- The sidebar lists assistants: the workspace's lead (Matilda by default) first, then its bots. Each one opens to its recent chats, including the sub-threads where the lead handed it work.
- You can chat with any bot directly. Threads record `botId`, and the bot answers with its own instructions.
- A workspace switcher sits at the top of the sidebar. New accounts start with a workspace led by Matilda, and `/` opens your first workspace.
- Verified on a local backend with verify-matlida: sign-up lands in the Matilda workspace, an added bot shows in the sidebar, and a message to it files the chat under that bot. Replies need the AI gateway, which the anonymous local backend can't reach.

### Orb avatars, settings, library and members (2026-10-19)

- Assistants wear one of 12 preset orbs (CSS gradients in `src/components/orb.tsx`, ids in `convex/lib/avatars.ts`). You pick one on the bot form or, for the lead, in Settings. Nobody uploads images.
- Settings (`/p/$projectId/settings`) edits the workspace, the lead's name and look, and links to texting. Library (`/p/$projectId/library`) replaces the Commands page.
- Chats have members. The members bar on a chat adds or removes other assistants, and the chat's assistant can hand work to them with `ask_bot`. The lead works with every bot until you pick members. A bot works alone until you add some.
- Verified on a local backend: picking coral in Settings saves `avatar: "coral"` and the sidebar orb follows; adding Nora to Ivy's chat shows "With Nora".

### Web search, research, plans and voice (2026-10-19)

- Every assistant has `web_search` (Perplexity Sonar through the Convex AI gateway), `research` (Sonar Pro, for longer briefs) and `save_plan`. Tool calls show in the chat as cards that open to the result.
- Plans are checklists saved to the Library. Assistants create and revise them; you tick steps off or delete them there.
- The mic button in the message box records, transcribes on the server with Whisper (`chat.transcribe`), deletes the recording, and puts the text in the box for you to send.
- Verified on an authenticated local deployment (the anonymous one can't reach the gateway): asking Matilda to search for the latest Convex release and save an upgrade plan ran two web searches and saved a 3-step plan that shows in the Library. A spoken clip fed through the mic button came back as "Remind me to call the bank at 5 tomorrow."

### Assistant panel with costs (2026-10-19)

- The button at the top right of a chat toggles a right sidebar (`?panel=true`) with Costs, Context, Connectors, Environment and Changes.
- Costs come from a new `usage` table. Every model step (through the agent's `usageHandler`), web search and research records its AI gateway cost and tokens. Each reply records its Convex action time, which the panel turns into an estimate at $0.30 per GB-hour for 64 MB actions. A bot's sub-thread work is charged to the chat that asked for it.
- Context shows the assistant's role, instructions, guidelines and members. Connectors shows search, research, voice and texting (with a link to set texting up). Changes lists plans saved from the chat.
- Verified on the authenticated local deployment: a weather question with one web search showed $0.01 AI across 3,095 tokens (two model steps and a $0.0053 search) and 14.0s of action time.

### Reminders (2026-10-19)

- Every assistant has `set_reminder`. A reminder is scheduled with `ctx.scheduler.runAt`. When it's due it posts in its chat, and also texts through Photon when you asked for that. The Library lists upcoming reminders, and you can cancel them there.
- Assistants know the current time in your zone. The browser sends its IANA time zone with each message.
- Calls wait on Photon: its voice line is SIP-only today, with SDK call control and webhooks on the roadmap, so a Convex action can't place a call yet. A Vapi bridge was tried and dropped at the user's request.
- Verified on the authenticated local deployment: "Remind me in 1 minute to stretch" set a reminder for one minute out in local time, and the chat got "⏰ Reminder: Time to stretch!" when it fired.

### Portraits (2026-10-19)

- Assistants wear one of 22 ready-made portraits: Matilda, coder, researcher, writer, planner, engineer, chef, cat, frog, bear, bunny, robot, ghost, buns, beanie, curls, scarf, tabby, crown, bandana, fox and silver. They're 256px JPEGs in `public/avatars/` (232 KB total). Nobody uploads images.
- They follow the minimal bot-icon spec the user shared: two solid black capsule eyes, no mouth or nose, soft blush, a tilted close-up, flat colors on near-black. They were generated with `openai/gpt-image-1` through the Convex AI gateway from original character descriptions. Nothing was taken from the community gallery, whose images belong to their creators.
- `bots.portrait` and `projects.portrait` replace the drawn-look fields (shape, color, emblem, figure), and the drawing code is gone. An assistant without a portrait gets one from its name, and the Matilda workspace gets hers.
- Two portraits ("curls" and "scarf") were regenerated: the first had too little contrast against the background, the second a greenish skin tone.

### OpenTelemetry override (Dependabot #2, 2026-10-19)

- `@opentelemetry/core` 2.7.1 had a medium-severity advisory (unbounded memory in W3C Baggage parsing, fixed in 2.8.0). It comes in through `@spectrum-ts/core` → `@photon-ai/otel` 3.8.1 (the latest), whose OTel exporters (0.218) pin 2.7.1 exactly, so no parent bump fixes it.
- `pnpm-workspace.yaml` now overrides it to `^2.8.0`, so the lockfile resolves one copy, 2.12.0. Drop the override once `@photon-ai/otel` moves past exporters 0.218.
- Deployed Convex installs `@spectrum-ts/*` as external packages with npm, which ignores pnpm overrides, so the Node runtime still has nested 2.7.1 copies under the OTel exporters. Their only baggage code parses the `OTEL_EXPORTER_OTLP_*_HEADERS` env vars, which is operator config, while Photon's baggage propagator resolves to the top-level 2.12.0 (traced by the PR's verifier).

### Voice calls (2026-10-19)

- The phone button at the top right of a chat opens a call with that chat's assistant: their portrait, Listening, Hearing you, Thinking or Speaking, the last two lines said, and mute and hang up.
- The browser records until about 0.9 s of quiet (a Web Audio level check), uploads the clip, and `calls.turn` transcribes it with Whisper, deletes it, saves your words in the chat, answers with the same agent and tools in a short spoken style, and reads the answer out with Kokoro (`hexgrad/kokoro-82m`). The mp3 is deleted 10 minutes later. Then it listens again.
- Each assistant speaks in one of six Kokoro voices, picked from its name. Matilda always gets `af_heart`.
- Costs: listening records a `voice` usage row, and the reply records its usual model and compute rows. Speech has no cost in the gateway's metadata yet.
- Verified on the authenticated local deployment: a spoken "Hi Matilda, what is the capital of France?" fed in as the mic came back spoken as "The capital of France is Paris." Both lines landed in a new chat, the clip was deleted, and the mp3's deletion was scheduled.

### Rings for call reminders (2026-10-19)

- `set_reminder` takes `via: 'call'`. When a call reminder is due it rings: an incoming-call card with the assistant's portrait and a soft ring tone (`public/ring.wav`) shows on any page.
- Answer opens the chat it was set in and a call where the assistant speaks first ("Hi, it's Matilda with your reminder. …"), then listens like any call. Decline, or 30 s with no answer, posts the reminder in the chat. A missed call also texts you when texting is linked.
- No new table: reminders gained a `ringing` status, and the chat note says whether you picked up, declined or missed it.
- Verified on the authenticated local deployment: "Call me in one minute to remind me to stretch" rang on the Library page. Answering said the reminder out loud and went to Listening. A declined ring and an unanswered one (marked missed after 30 s) both landed in the chat.

### Chat header (2026-10-19)

- A chat now has one header row: the sidebar toggle, the assistant's portrait and name, its members (avatars, "with …", and the add button), then Call and the details toggle on the right. Before, the call and details buttons floated below the app header and "No members" sat on its own line above the messages.
- Other pages keep the app header with the workspace name. "No members" is gone; the add button stays when there are bots to add.
- Checked on the local deployment at desktop width (with and without the details panel), on a new chat, on Library, and at phone width with no sideways scroll.

### Messaging on WhatsApp and Telegram (2026-10-19)

- Texting became Messaging (`/p/$projectId/messaging`). A project links one chat per app: iMessage, WhatsApp or Telegram, through Photon. The `link <code>` flow is unchanged and works from any of them. Linking an app again replaces its old link.
- Start a message with `@Ivy` to talk to Ivy, and `@Matilda` to go back. The assistant you picked stays on for later messages, and `who` lists who you can message. Bots sign their replies ("Ivy: …") since they share one chat.
- Each assistant gets its own chat per link, titled like "Ivy · Telegram", so the conversation also shows in the app.
- Replies go out by the chat's app, which Photon's space record names. iMessage keeps the component's gRPC sender. WhatsApp uses `@spectrum-ts/whatsapp-business` in cloud mode, where Photon holds the Meta credentials. Telegram uses `@spectrum-ts/telegram` with `TELEGRAM_BOT_TOKEN`. `api/sender:connectTelegram` points the bot's webhook at Photon.
- WhatsApp only allows free-form messages within 24 hours of your last one. Meta enforces that, so a reminder texted outside the window fails to send but still posts in the chat. Approved templates are a follow-up.
- Verified on the authenticated local deployment with signed, Telegram-shaped Photon webhooks, standing in for Photon's delivery: linking replied "Linked to Matilda", `@Ivy` answered as "Ivy: Ash" and stayed on Ivy for the next message, `who` listed both, `@Matilda` switched back, and the Messaging page showed Telegram linked. Each reply went to the Telegram sender, which stopped at the missing bot token. Live delivery on WhatsApp and Telegram still needs the Photon credentials.

### Call history and a docked call (2026-10-19)

- A call now docks at the side of the app instead of covering it: the assistant, its status, the whole transcript (scrolling, newest in view, nothing cut to the last two lines), and Mute and Hang up. The chat stays usable next to it. On phones it's full screen.
- Calls are saved so none is lost: `calls` (who, chat, when it ended) and `callLines` (each thing said, and for replies how long they took). The server starts the record with the first line, from a turn or an answered ring's opening, so no client step can fail first. Each turn saves your line as soon as it's heard, and the reply's line even if speaking fails. A call that never hung up (a closed tab) ends at its last line.
- Readable output: `npx convex run api/calls:dump` prints the latest call (or `'{"id":"<callId>"}'`) as text with timings, like `[0:03] Matilda, replied in 4.3 s: …`. The Calls tab copies the same text.
- The details panel has a Calls tab: an assistant's last 20 calls with time, length and first line, each opening to its transcript, Copy transcript, and a link to the chat.
- A call's first turn keeps the URL's other params, so the details panel stays open. A stale call error clears once a turn succeeds.
- Verified with unit tests (a call's lines across two turns, reply timings, a never-hung-up call ending at its last line, the answered ring's opening line, another user refused, the dump text) and on a local deployment with a seeded call: the Calls tab listed it and Copy transcript produced the dump's text. No live calls were placed.

### Calls that take turns like people (2026-10-19)

- Talking over the assistant pauses it. The mic keeps listening while a reply plays: a quarter second of talking pauses it, a short "mm-hm" (under 0.7 s, then 0.6 s quiet) lets it carry on from where it stopped, and more makes it your turn. Its own voice leaking into the mic needs a louder level (0.05 vs 0.035) to count.
- Your turn ends after 1.2 s of quiet instead of 0.9 s, so a pause mid-sentence doesn't hand the turn over.
- A reply you talked over is marked cut off in the live transcript, the Calls tab and the dump ("(you cut in)"), and the next reply is told you may have missed its end.
- The rules live in one pure function, `hear` in `src/lib/turn-taking.ts`, with the thresholds as named constants to tune from real calls. Its tests feed simulated mic levels: a mid-sentence pause, a cough, echo, an "mm-hm", a real interruption, the 30 s cap and the idle restart.
- Not verified on a live call, by the user's request. Echo cancellation is the risk: if the assistant pauses itself, raise `OVER_REPLY_LEVEL`.

### Details panel on phones (2026-10-19)

- Below the `md` breakpoint the chat's details panel is now a full-screen overlay (`fixed inset-0 z-40 bg-background`), like the docked call. From `md` up it's the same 20rem side column as before.
- Before, at 375px it squeezed the chat to about 55px: the message box placeholder wrapped one letter per line, and the header's Call and details buttons sat under the panel where they couldn't be tapped.

### Faster call replies (2026-10-19)

- The assistant starts talking after its first sentence instead of after the whole answer. As the reply streams, `calls.turn` cuts it into pieces (`takePieces` in `convex/lib/sentences.ts`), voices each with Kokoro in order while the rest is still coming, and appends it to a live turn (`liveTurns`).
- The browser makes the live turn's key, watches it with the Convex client from the moment it uploads your words, and plays each piece as soon as it's decoded. What you said and the reply so far show in the transcript as they arrive.
- The first piece is cut at the first sentence end so speech starts fast. Later pieces gather sentences to about 80 characters, for fewer, smoother clips. Live turns and their audio are deleted after 10 minutes.
- Talking over the assistant works across pieces, and now also while it's still thinking. The call history records `firstMs`, the time to the first words, and the dump shows it: `first words in 1.4 s, all of it in 5.2 s`.
- Verified with unit tests: the splitter (a short first piece, gathering, decimals, new lines, long runs, nothing lost while streaming) and the turn (two sentences voiced as two pieces in order into the live turn, another user can't read it, timings in the dump). The browser playback is untested on a live call, by the user's request; read real timings with `npx convex run api/calls:dump`.

### Connections (2026-10-20)

- One registry lists every channel: Email, iMessage (which also reaches SMS and RCS phones through Photon's fallback), Telegram, WhatsApp, Phone calls (coming soon), and the assistants' tools (web search, research, voice input, voice replies). It lives in `convex/lib/channels.ts` as a union on `via`, so adding a channel is one entry.
- `channels.list` computes each channel's status for a workspace from existing data: connected, ready to link, needs deployment setup, or coming soon. It says which env vars are missing by name and never sends a value.
- `/p/$projectId/connections` shows the list in two groups. The details panel's Connectors section reads the same query, the Messaging page reads the registry's names and keeps the `link <code>` flow, and the command menu and Settings link to the page.
- `MAIL_DOMAIN` is declared (optional) for the email channel, which later PRs fill in.
- Verified with unit tests: the pure status rules, the query's statuses with and without env vars and a linked app, that no env value appears in the result, and that another user is refused. Not run against a deployment: this environment only had access to the shared dev deployment, which is off limits.

### A personal email address (2026-10-20)

- Each user claims a handle on Connections and gets `handle@MAIL_DOMAIN`, answered by the workspace it was claimed in. Claiming the same handle from another workspace moves it there, and Release frees it. `mailboxes` holds one row per user.
- Handles are 3 to 32 of `a-z0-9._-` with no dot at either end or doubled, and role names (postmaster, abuse, admin, noreply, mailer-daemon, support and the rest of the list in `convex/lib/handles.ts`) are refused. Claiming needs a verified sign-in email, which is the only address the assistants will write to.
- The Email row on Connections shows the address, the reply-to address and the claim form, and the registry's status for email is now connected, ready, or ready with "answers in another workspace".
- Email goes through Photon's Email channel (beta platform API): the Email row needs `MAIL_DOMAIN`, `PHOTON_PROJECT_ID` and `PHOTON_API_KEY`.
- Verified with unit tests: normalization and each refusal reason, reserved and duplicate handles, renaming freeing the old handle, no verified email, no mail domain, the move between workspaces, release, and another user's workspace refused.

### Email in the app, answered by Matilda (2026-10-20)

- Every minute a cron asks Photon for new email to the users' addresses. Mail from the owner's verified sign-in address goes to a "Matilda · Email" chat, and Matilda answers by email in the same thread, to that address only. Everyone else's mail is posted in a separate "Email inbox" chat and isn't answered, so a stranger's text never reaches Matilda's own conversation. Spam is shown in the inbox and never answered; mail to an unclaimed address is ignored.
- `emails` records each Photon message id and its outcome (answered, failed, shown, ignored), never the text, so each email is handled once. A reply that can't be sent says so in the chat.
- It polls because Photon's beta webhooks don't document their signature yet. Photon doesn't pass on DKIM or DMARC results, so a forged From can make Matilda answer, but the reply only ever goes to the owner.
- Verified with unit tests, Photon's API mocked: the owner's email answered with the right recipients, threading and idempotency key, quoted history cut, a second check skipping it; a stranger's email shown and unanswered; spam; unclaimed addresses; a failed send; and nothing running before Photon is set up.

### Email reminders and limits on answers and texting (2026-10-20)

- `set_reminder` takes `via: 'email'`: when it's due, the reminder is emailed to the owner's verified address from their assistant address, through Photon (a new thread per reminder, keyed by the reminder so retries send once), and still posts in the chat. Without an address, or when Photon refuses, it only posts, with a note.
- Matilda answers at most 5 of the owner's emails at once, then 20 an hour (`@convex-dev/rate-limiter`). Past that, the email is posted in the chat with a note and not answered. This caps forged mail and out-of-office loops, since Photon can't tell a forged From.
- Inbound texting is limited per owner (a burst of 15, then 60 an hour across all linked apps); a linked owner over the limit is asked to slow down, an unlinked chat over its own limit gets nothing back. `link <code>` allows 5 tries per chat, then 10 an hour, silently, so codes can't be guessed.
- Verified with unit tests, Photon's API mocked: an email reminder's exact Photon calls, the no-address and failed-send notes, the sixth email in a burst posted but not answered, the owner flood across two apps, the ignored stranger, code guessing, and a turn that sends nothing.

### An editor for instructions (2026-10-20)

- A bot's instructions, the workspace guidelines and a command's text are edited in a TipTap markdown editor: headings, bold, italic, code, lists, quotes, dividers, a Markdown toggle for the raw text, and a Rules menu that drops in ready-made rules (no malware or attacks, no personal data, no impersonation, keep these instructions private, stay in scope, cite sources, ask before acting, no professional advice). The markdown is still the only thing stored, and the assistants read it as before.
- Notes: select a passage and leave a note on it. Open notes highlight their passage in the editor; they can be resolved, reopened or deleted. They live in a `comments` table and never touch the text.
- Instructions and guidelines can now be 8000 characters.
- Verified with unit tests for the comments backend and the rules, plus the type check and the build. The editor itself wasn't driven in a browser here.

### Several models (2026-10-20)

- Pick a model per bot and for the lead in their forms, from eight gateway models (Claude Sonnet 5, Opus 5, Haiku 4.5; GPT-5, GPT-5 mini; Gemini 2.5 Pro, Flash; DeepSeek V3.2) or any gateway id typed by hand. A menu in the chat header switches the chat itself to any model, and the chat's history stays; "Assistant's own" goes back. A new chat can start on a model.
- Usage rows record the model, and Costs shows it per step. The details panel's Model line shows the chat's effective model.
- Verified with unit tests: a bot and the lead reply on their own models and the default otherwise; a chat switching models keeps its history and records each model in usage; a new chat starting on a model; bad ids refused and another user unable to switch.

### Setup guide (2026-10-20)

- `docs/setup/channels.md` covers every channel in order: email through Photon's Email channel (connect a domain, publish the DNS records Photon shows, an API key with `project:read` and `project:write`, the three env vars, claiming an address, trying it), texting through the Spectrum SDK with its webhook, Telegram, WhatsApp, and why phone calls wait.
- It names the two mistakes found on dev: a `SPECTRUM_PROJECT_SECRET` set to the project id, and a webhook destination made on Photon's beta platform, whose format `/spectrum/webhook` rejects.

### Telegram through Photon's platform API (2026-10-20)

- `POST /photon/webhook` takes Photon's platform events, checks the Standard Webhooks signature (`webhook-*` or `svix-*` headers, 5-minute tolerance) against `PHOTON_WEBHOOK_SECRET` over the raw bytes, and logs only header names when a delivery is refused.
- A Telegram text is recorded once by Photon's message id and answered by the same texting logic as before (`link <code>`, `@name`, the limits), then sent back through Photon's API as the project's agent in that chat. Linking stores that agent's id, so text reminders and missed-call texts to the chat go through Photon too.
- An email event starts the email check at once instead of at the next minute.
- Telegram on Connections now needs `PHOTON_PROJECT_ID`, `PHOTON_API_KEY` and `PHOTON_WEBHOOK_SECRET`.
- Photon hasn't delivered a single event to `/photon/webhook` yet, so a cron reads Photon's message list for Telegram texts every minute, and every 3 seconds for 2 minutes after any message (one loop at a time, kept alive by a `telegramPolls` row). Each message goes through the same once-only record as the webhook. Live on dev: replies in 5 to 9 seconds during a chat, up to a minute for the first message.
- Verified with unit tests, Photon's API mocked and deliveries signed in the test: an unlinked chat told how to link; linking, chatting and a text reminder through Photon; a repeated delivery answered once; forged, stale and unsigned deliveries refused with nothing recorded; the minute check answering once; the fast check catching the next message and stopping by itself. Tried live on Telegram: linking and chatting work.

### Grok and Muse in the model menu (2026-10-20)

- The model menu and the bot and workspace forms also offer Grok 4.7 (`x-ai/grok-4.7`) and Meta's Muse Spark 1.3 (`meta/muse-spark-1.3`), both served by the Convex AI gateway.

### One createAgent, and effort levels (2026-10-20)

- `createAgent()` in `convex/models/threads/lead.ts` builds every assistant for a reply: the lead or a bot, on the chat's model (then its own, then the default) and effort, with its instructions, tools (`assistantTools` and `ask_bot`) and usage recording, and returns the `Agent`. It replaces `createLead`, `createBot` and the hand-built bot inside `ask_bot`; chat, texting and email all use it.
- Effort is low, medium or high, picked like the model: the chat's pick, then the bot's or lead's own, then medium. It sets the steps a reply may take (4, 8 or 20), how many times it may ask a bot (2, 6 or 12), and the reasoning effort sent to the gateway (`reasoning_effort`). An effort menu sits next to the model menu in the message box, and the bot and workspace forms have an Effort field.
- Verified with unit tests: effort from the default, the workspace, the chat's pick, back to the workspace's, and a new chat starting on one; only the owner can set it. Whether each model honors `reasoning_effort` through the gateway wasn't checked live.

### Contacts, and messages to other people (2026-10-20)

- Assistants keep contacts (`contacts`): `save_contact` and `find_contact` tools, saved by name, updated when the same name comes back, found by the start of a name.
- `set_reminder` takes `to` (a contact) and `say` (the message, written to them): "tell Luke tomorrow to check his car insurance" schedules an email to Luke from your assistant address, signed as an automated message from your assistant. It waits as `pending` with Send and Cancel in the chat, and goes out only once you confirm. Calling or texting other people isn't available; the tool tells the assistant to offer email instead. At most 10 messages to contacts at once, then 20 a day per workspace.
- The chat's tool types now come from `assistantTools` itself (`InferUITools`), so a tool's output can't drift from what the chat shows.
- Verified with unit tests, Photon's API mocked: contacts saved once per name and found by prefix; a message held until confirmed, then emailed with the exact text and noted in the chat; cancel; another user refused; no email; the limit.

### Tasks on Convex workflows, with live steps (2026-10-20)

- Longer work runs as a task on `@convex-dev/workflow` (`convex/lib/workflow.ts`, `convex/models/tasks/`). A task row holds its status (waiting for you, working, done, stopped, cancelled) and each step's status, times and a short result; every workflow step writes to it, so the chat's card updates live.
- The first kind is `run_plan`: the assistant saves a plan and calls `run_plan`; the chat shows the steps with Start and Don't start. On Start each step is done by the lead with its tools in the task's own thread (so each step sees the ones before it), retried on its own, and ticks the plan's checklist. Cancel stops it after the running step. When it ends, the chat gets "Done" or "Stopped" with the reason.
- The details panel's Library tab lists the chat's tasks and their progress.
- Verified with unit tests, the model mocked and the workflow run with convex-test: Start running both steps in order and ticking the plan; Don't start; cancel; a step that keeps failing; owner-only; and that a task can't start another plan.

### Built-in commands, a "+" menu, and commands written by AI (2026-10-20)

- Every workspace has built-in commands without saving them (`convex/lib/commands.ts`): `/create` (say what you want made, and the assistant picks the tool: a plan, a run, posts, an email or doc, research, a reminder or message, or a new command through the new `save_command` tool), `/plan`, `/run` (plan, then run it step by step), `/posts` (X, Reddit and Discord), `/email`, `/doc` and `/research`. Type `/name` and what it's about, like `/posts our launch week`. A Library command with the same name replaces a built-in.
- Commands are now resolved by name when the reply runs (the workspace's first, then the built-ins), and bots follow them too, not just the lead.
- The "+" in the message box lists the commands and your own; clicking one puts `/name ` in the box for you to finish. Typing `/` in the box opens the same list, like Discord: it filters as you type, ↑ and ↓ move, Tab, Enter or a click picks, Esc closes; once a command is typed, a line above the box says what it does, or that there's no such command. "Create a command with AI…" opens a dialog: say what it should do, `commands.draft` writes the name, description and instructions (`generateObject`), and you check and edit them before saving. The name is made a unique slug, built-ins included.
- Verified with unit tests, the model mocked: a built-in runs without being saved, a Library command overrides it, a bot follows a command, the draft's name cleaned and made unique with nothing saved, and another user refused. The menu and dialog weren't driven in a browser.

### Texting limit taken once, as a message is recorded (2026-10-20)

- `convex insights` showed `api/texts.js:admit` retrying on OCC conflicts on the rate limiter's table: several Telegram messages picked up together were answered side by side, and each reply took a token from the same `inboundText` bucket at the same moment. Retries succeeded; nothing was lost.
- `texts.received` now takes the token while it records the message, one at a time, and passes the result to the reply. Photon replies no longer call `admit`; the Spectrum SDK route still does.
- Verified with a unit test: 16 texts in one check get 15 answers and one "slow down", with the limit taken as they're recorded.

### Charts and post previews in the chat (2026-10-20)

- `show_chart` draws numbers in the chat with Recharts (bar, line, area or pie, up to 4 series, with a unit and a source), in the theme's chart colors. The chart component loads only when a chart appears, so Recharts stays out of the main bundle.
- `preview_post` lays a post out roughly as LinkedIn, X, Reddit or Discord show it, with the character count against the platform's limit, flagged in red when it's over. It posts nothing.
- New built-in commands: `/chart` (chart what you ask for, from your numbers or looked up with a source, never invented) and `/preview` (draft a post and preview it, LinkedIn when no platform is named). `/posts` now previews each draft too.
- Verified with unit tests: the chart schema accepts a good chart and refuses mismatched values or a multi-series pie, and the commands name their tools. The components weren't driven in a browser.

### One chat per assistant, and no members by default (2026-10-21)

- Matilda and each bot have one chat (`projects.threadId`, `bots.threadId`). The app, Telegram, email and calls all talk there; `threads.main` finds it, and the first message starts it. A workspace from before keeps its newest chat as the one chat; older chats stay in the database but leave the sidebar. Email from other people still goes to the Email inbox, now a sidebar link.
- No bots are members of a chat until you add them from the chat header. Before, the lead's chats had every bot. Tasks hand steps only to the chat's members.
- Gone: "New chat", the per-assistant chat lists in the sidebar, "New group chat" in search, and `?thread=` links.
- Verified with unit tests: one chat per assistant that messages keep going to, the newest old chat reused but not email's, no members by default, Telegram and email into the one chat. The UI wasn't driven in a browser.

### Only Matilda answers email and texts, and you reply to email yourself (2026-10-21)

- Texts on iMessage, WhatsApp and Telegram only ever go to the lead, in her one chat. `@name` no longer switches to a bot, and "who" is gone.
- Email no longer replies on its own. All email shows in the lead's chat: yours as your message, anyone else's as a quoted email, each with a draft reply. Others' email is drafted with no tools and no chat history. The Email inbox chat and its sidebar link are gone. Under each email, Reply opens the draft to edit, and Send mails it in the email's thread, to its sender only, once. The sent reply shows in the chat.
- `emails` rows now keep what a reply needs: the chat and message it was posted as, the sender, subject, Photon thread and mailbox user, the draft and when you replied.
- Verified with unit tests: drafts for yours and others' email with nothing sent, your edited reply sent to the sender only and only once, nobody else can reply, a failed send stays unreplied, spam and over-the-limit email not drafted, and texts to the lead even with `@name`. The Reply dialog wasn't driven in a browser.
- `find_emails` searches your earlier emails, yours and other people's, by words in the subject or text, optionally from one address (`emails.search`, a search index over the email's text, now stored on its row). Drafts use it for context: yours get it with the other read-only tools only (search, research, contacts, charts, previews, bots), since an email's sender can be forged; others' get only `find_emails`. The lead can use it in chat too. Emails from before this change aren't searchable.

### find_texts: search what you texted the lead (2026-10-21)

- What you text the lead from a linked iMessage, WhatsApp or Telegram chat is now kept in `receivedTexts` (not link codes, and not texts from unlinked chats), with a search index on the text.
- `find_texts` searches it by words, optionally from one app. The lead has it in chat and in drafts of replies to your email. Drafts of replies to other people's email don't, so a stranger's email can't pull your texts into a draft. Texts from before this change aren't searchable.
- Verified with a unit test: a linked chat's texts are found by words and app, the link code and texts sent before linking aren't kept, and another user's search finds nothing.

### Telegram is the only texting app (2026-10-21)

- iMessage and WhatsApp are gone. The Spectrum SDK went with them: its component, `/spectrum/webhook`, the outbox sender, the `SPECTRUM_*` and `TELEGRAM_BOT_TOKEN` env vars, and the `@spectrum-ts/*` and `@photon-ai/advanced-imessage` packages, plus the OpenTelemetry override they needed. Telegram already ran on Photon's platform API (`/photon/webhook` and the polling check), which stays.
- Reminders text only a linked Telegram chat. Old iMessage and WhatsApp links stay on the Messaging page, marked as no longer working, so they can be unlinked.
- `find_texts` searches Telegram only, with no app filter. Connections, Messaging, Settings, the README and the setup guide say Telegram only.
- Verified with the unit tests (texts, the Photon webhook and channels) and the dev deployment, which took the removal of the component.

### decide: Jev picks between options (2026-10-21)

- New `decide` tool: the lead (or a bot) gives the question, the options with optional descriptions, and the context that matters, and Jev, TypeSafe's judgment model, answers one choice question through the Convex AI gateway (`convexGateway.evaluationModel('~typesafe/jev-latest')` with the AI SDK's `experimental_decide`, in `convex/lib/decide.ts`). No TypeSafe key: the gateway bills it like the other models. The gateway's decisions endpoint is alpha.
- It returns the pick and each option's probability; when the pick is under 0.5, the assistant says it's close and names the runner-up. It's read-only, so email drafts can use it.
- New built-in `/decide` command that uses it. The chat shows a card with the question and each option's odds.
- Verified with unit tests against a fake decision model, and one live call on `dev/matilda` through the gateway (train over flight for someone who hates airports, 1.0 to 0.0).

### Everyday commands, part 1: lists and writing (2026-10-21)

- Researched what people use assistants for day to day: OpenAI's usage study (practical guidance, looking things up and writing are 78% of messages; two-thirds of writing is reworking the user's own text), Anthropic's Economic Index (recipes peak around 6pm; itineraries and workouts are common), household assistants (meals, groceries, to-dos, reminders) and Raycast's daily commands.
- New cards in the chat, each a tool in `convex/models/threads/everyday.ts`:
  - **Checklist**: plans and lists render live in the chat, with sections, ticking and Clear done. `add_to_list` keeps one list per name ("To-do", "Shopping list", "Packing: Lisbon"), started on first use.
  - **Drafts** (`show_drafts`): up to four versions, each with Copy.
  - **Table** (`show_table`): rows and columns, one row highlighted, a note for sources.
  - **Recipe** (`show_recipe`): change the servings and the amounts scale; Add to shopping list puts the ingredients on the Shopping list under the recipe's name.
- New built-in commands: `/todo`, `/shopping`, `/meals`, `/recipe`, `/pack`, `/rewrite`, `/reply`, `/translate`, `/tldr`, `/compare`, `/workout`, `/explain`. `/create` can make lists too.
- Texts, calls and emails don't get the card-only tools, so they answer in words.
- Verified with unit tests: lists by name, sections, ticking, clearing and ownership; a card adding to your list; every tool a built-in command names exists; cards left out of texts and calls; recipe amounts. The cards weren't clicked through in a browser (signed out).

### Everyday commands, part 2: today, time and money (2026-10-21)

- New cards and tools in `convex/models/threads/everyday.ts`:
  - **Today** (`get_today`, data from `projects.today`): what needs you (messages waiting for your OK, tasks to start, emails from the last three days nobody replied to), reminders in the next 24 hours, what's running, and lists with things left.
  - **Timeline** (`show_timeline`): a day in time blocks or a trip day by day, grouped.
  - **Settle up** (`split_costs`): who pays whom, and each person's paid and share. The math is in `convex/lib/everyday.ts`, in cents, with the fewest payments.
  - **Time zones** (`compare_times`): the time in each place, and a 24-hour strip per place with working hours filled and the hours everyone overlaps ringed. Done with `Intl` in code; zones are checked as real IANA zones.
  - **Focus timer** (`start_timer`): a ring counting down from when it was set, so a reload keeps time.
- New built-in commands: `/today`, `/dayplan`, `/trip`, `/split`, `/meet`, `/focus` and `/convert`.
- Verified with unit tests: splitting (odd cents, subsets, fewest payments, nobody owing), time zones (local times, day shift, overlaps, bad zones), the Today data (only what's due, yours, unreplied and open), and timeline and timer kept out of texts and calls. The cards weren't clicked through in a browser (signed out).

### Shopping: find things, fill a cart, buy at the store (2026-10-21)

- Researched how an assistant can buy for someone: OpenAI and Stripe's Agentic Commerce Protocol, Google and Shopify's Universal Commerce Protocol, Stripe's Link wallet for agents (US and Canada only, with a spend request the user approves) and Shopify's agent docs. Shopify's Global Catalog searches every Shopify store and works anonymously at a low rate; its cart links take the buyer's email and shipping address. Paying on the user's behalf needs Shopify's trusted-agent tier or Link, so the user pays on the store's checkout for now.
- `convex/lib/shopify.ts`: `searchProducts`, `productOptions` and `lookupVariant` over the Global Catalog, and `checkoutLink`, which builds a store's cart link with the user's details.
- Shopping details in Settings (`shoppingDetails`): name, email, address, a two-letter country code and notes on sizes and preferences. Searches only show what ships to that country, and the assistants read the notes. No card details.
- Tools: `find_products` (a card of product tiles with price, list price, rating, store and Add to cart), `product_options` (sizes and colors), `add_to_cart` and `show_cart` (a live cart by store, with quantities, totals, "Buy at {store}", which opens that store's checkout with the details filled in, and "Bought it, clear"). Items are always checked against the catalog when added, so prices and links are real.
- Commands: `/shop`, `/gift` and `/cart`.
- Verified with unit tests (catalog parsing and filters, lookup, checkout links, details validation and ownership, the cart by store, quantities and clearing) and one live run on `dev/matilda`: a real search, lookup and checkout link from Shopify. The cards weren't clicked through in a browser (signed out).
- ponytail: requests are anonymous with Shopify's example agent profile. For production, host our own UCP profile and send a Dev Dashboard token.

### Price watches (2026-10-21)

- `watch_price` watches a variant from the catalog and records the price now and the one you want (`priceWatches`). An hourly cron (`shopping.checkPrices`) looks up each watch about once a day. When the price is at or under the target, it posts in the chat that set it, with a link; when the store stops selling it, it says so and stops. Out of stock keeps watching.
- The chat shows a watch card: the price now, your target, the status and Stop.
- New built-in command: `/watch`.
- Verified with a unit test: a watch isn't checked again within a day, then a drop and a gone item each post in the chat and end the watch.

### Previews come in sets, with Discord (2026-10-21)

- `preview_posts` replaces `preview_post`: one call shows a set, two or three labelled versions per platform (like Punchy, Story, Question), with a tab per platform and Copy on each. Older chats still show their one-post previews.
- Discord previews look like Discord: a `#channel` header (the assistant suggests one), the name and today's time, on Discord's dark background.
- `/preview` writes three versions for each platform named, or for LinkedIn, X and Discord when none is named, then says which it would pick. `/posts` shows two versions per platform.
- Verified with a unit test of the set's schema, and the commands test (every tool a command names exists). Not clicked through in a browser (signed out).

### /news: set up what you follow, then the briefing (2026-10-21)

- `/news` with no settings shows a setup card (`setup_news`): topic chips (World, Middle East, Politics, Business, Tech, AI, Science, Health, Climate, Sports, Culture), your own topics, regions, what to leave out, stories per topic, and a daily time. "Save and get the news" saves and asks for the briefing.
- `get_news` searches each topic side by side with the search model for the last 24 hours, and keeps only well-formed stories with web links (`convex/lib/news.ts`). The card shows them by topic with headline, one line and source, and Edit topics opens the settings inline. `/news Gaza and climate` asks once about those topics.
- With a daily time, an hourly cron (`news.sendDaily`) posts the briefing in the lead's chat at that hour in your time zone, once a day.
- Verified with unit tests (parsing, due time across time zones, the daily message, settings validation and ownership, the daily post once per day) and one live search on `dev/matilda` that returned real stories with sources for World and Tech.

### Pages: reports, memos and dashboards you edit together (2026-10-21)

- New `pages` table and a page at `/p/:projectId/pages/:pageId`: the title, the kind, headline numbers for a dashboard, the markdown in the editor you already use for instructions, and Save. Pages are listed in the Library.
- Tools: `write_page` (new, or the whole page replaced), `read_page` (the page with your edits, before an assistant changes it) and `keep_page_updated` (every day or week, following instructions). An hourly cron (`pages.refreshDue`) has the lead update each due page in its own thread under the chat that made it, with tools that read and look things up; the page's "Keep it up to date" form sets the same thing.
- The chat shows a live page card (title, kind, numbers, first lines, Open the page) and a line when a page starts or stops being kept up to date.
- Dashboards use Arc's metric card and sparkline (uiarc.dev, MIT), copied into `src/components/ui/arc` with `motion` 14.2.0. Arc's own theme uses the same names as shadcn's (`--background`, `--accent`), so instead of importing it, `arc.css` maps the tokens these components read onto this app's theme under `.arc`.
- Commands: `/report`, `/memo` and `/dashboard`.
- Roles: the page is an `article` with its title as its label, the numbers a labelled list, saves and errors are `status` and `alert`, and the chat card is a labelled section.
- Verified with unit tests (write, your edits read back, ownership, another workspace refused; a page kept up to date is due after its period, refreshed by the lead in a sub-thread, then not due). Not clicked through in a browser yet.

### Roles on the chat cards, and a crash fix (2026-10-21)

- A bot's card crashed the chat when a saved `ask_bot` result came back without its input (`Cannot read properties of undefined (reading 'task')`). It now shows the Task line only when there is one. Also as its own PR against master. The decide card read its question the same way and is guarded too.
- Every chat card is now a labelled region (`section` with an `aria-label`: the list, recipe, timeline or page title, "Your cart", "Settle up" and so on), loading lines are `role="status"`, product grids are lists of items, and tables have a caption.

### No card can crash the chat (2026-10-21)

- After `preview_post` was renamed to `preview_posts`, the model still called `preview_post`, copying its own older messages. The call failed, and the saved failure had no post text, so the preview card crashed the chat (`Cannot read properties of undefined (reading 'length')`). `preview_post` is back as a one-post alias.
- Every card in a message now sits in an error boundary: one that can't render says "This card couldn't be shown" and the rest of the chat keeps working.

### A volume bar on calls (2026-10-22)

- The call panel has a volume bar above Mute and Hang up: Quieter, a slider from silent to 150%, Louder, and the level. Replies play through a gain node, so a change applies to what's playing now, smoothed so it doesn't click.
- The level is saved on this browser and kept in step across tabs; it starts each call where you left it.
- Verified with a unit test of the clamping (0 to 150%, whole percents) and pnpm check. Not tried on a live call.

### Models as an object map (2026-10-22)

- `CHAT_MODELS` is now an object keyed by gateway id (`{ 'anthropic/claude-sonnet-5': { name, maker, note }, … }`), typed with `satisfies Record<string, ChatModel>`. `isListedModel` checks own keys only, and `modelName` looks a name up by id. The model menu and the model field iterate it with `Object.entries`.

### Audio chat: voice notes, and Fast voice on calls (2026-10-22)

- `convex/lib/audio.ts` calls the gateway's Chat Completions with an audio chat model (`openai/gpt-audio-mini`, from `AUDIO_CHAT_MODELS`), using `getServiceToken('ai-gateway')`, `modalities: ['text', 'audio']` and a streamed `pcm16` answer. Each assistant has its own voice (`audioVoiceFor`; Matilda's is `marin`). The AI SDK only returns text for these models, hence the direct request.
- `speakWith` (in `models/voiceClips`) runs one spoken turn: the assistant's instructions without tools, the chat so far as text, and the recording; what you said is transcribed at the same time, and when that comes back empty the answer is cancelled.
- Voice notes: a voice note button next to the mic in the chat box. The note is converted to a 16 kHz WAV in the browser, answered in voice, and the reply plays right away at your call volume. Both messages are saved to the chat with an audio player (`voiceClips`).
- Fast voice: a switch on the call panel, saved on this browser. Turns go to the audio chat model in one step, streamed into the live turn in pieces (the first after 0.6 seconds of audio), saved to the chat and the call's transcript. It can't use tools, and says so when asked for something that needs one.
- Live on `dev/matilda`: a spoken question as MP3 and as WAV with chat history got "2 plus 2 is 4." and "The capital of France is Paris." back in voice, first audio in about 0.9 seconds, about $0.0002 a turn.
- Verified with unit tests (the stream with chunks split mid-line, gateway errors, the WAV wrappers, voices; a voice note answered and saved with clips only you can see; a silent note saved nothing; a Fast voice call turn in pieces). Not tried in the browser.

### Talking in the chat, hands-free, instead of voice notes (2026-10-22)

- Voice notes are gone (the button, the players and the `voiceClips` table): they needed a stop press and went through the tool-less audio model, so asking for a command didn't work.
- The chat box has a Talk button. It starts the call engine inline: it keeps listening, works out when you've finished, answers, and listens again until you end it. What's said lands in the chat as plain messages. Normal turns keep every tool; Fast voice (the switch on the call panel) still uses the audio chat model.
- While talking, a voice bar replaces the box: your face and the assistant's, each swelling with the live level of your voice and theirs (a second analyser on the reply's gain node), and a wave between you in sky for you and green for them. It's painted every frame from a ref, without re-rendering, and stays still for reduced motion. Mute your mic, the volume bar, and Stop talking.
- The volume bar's speaker icon now mutes the assistant and brings it back to the level it had; the slider and the level stay.
- The audio chat turn moved to `convex/models/threads/voice.ts` (`speakWith`, `voice.prepare`, `voice.save`).
- Verified with unit tests (Fast voice turn in pieces, a silent Fast voice turn saving nothing) and pnpm check. Not tried in the browser.

### Commands are safe to run twice (2026-10-22)

- Saving a command converges: each command keeps a SHA-256 of its markdown, so saving the same name, description and markdown again (a retry after a lost response, a double click, the model calling `save_command` twice) changes nothing and returns the same command, dropping the duplicate file. A different command can't take a name that's in use.
- `save_command` now looks its name up inside the same transaction as the write (`replace`), so two saves of one name can't both think it's new. The Library's Save and the tool share `saveCommand`.
- Removing a command that's already gone does nothing, instead of failing.
- A run that stops between storing the markdown and saving the command leaves a file nothing points to. An hourly sweep (`commands.sweepFiles`) deletes files from one to two hours ago that no command keeps, judged by whether any command points to the file, so it holds wherever a run stopped. Commands are the only files kept past an hour.
- Verified with unit tests (same save twice, new and edited; a name clash; replacing by name three times; removing twice; the sweep deleting leftovers, keeping commands and new files, and finding nothing the second time) and one run of the sweep on `dev/matilda`.

### Models by job, and quick summaries (2026-10-22)

- `MODELS` in `convex/lib/models.ts` is the one map of job to gateway model: replies, quick summaries, decisions, web search, research, hearing you, speaking on calls and Fast voice. `JOBS` gives each job its name, the model's name and maker, where you meet it, and its group. The audio chat model moved there from `lib/audio.ts`.
- A Models page (`/p/:projectId/models`, linked from Settings and search) shows the jobs by group, each with the model's name, maker, id and what it's used for, and the workspace's own chat model when one is picked. It reads the map directly, with no backend call.
- Quick summaries: a `quick_summary` tool on Gemini 2.5 Flash (fast and cheap) that `/tldr` now uses.
- `useUpload()` uploads a file to Convex storage in one call; the mic button and calls use it instead of fetching an upload URL themselves.
- Verified with pnpm check, the tests (every tool a command names exists) and one live summary through the gateway in 0.9 seconds.

### Pictures (2026-10-22)

- A `generate_image` tool makes a picture with GPT Image 1 through the Convex AI gateway (`MODELS.image`), in a square, wide or tall shape, and saves it in Convex storage. The chat shows it as a card that opens full size. It's left out of texts, email and calls, like the other cards.
- `/image` turns what you describe into a detailed prompt and makes the picture.
- The Models page lists it under a new "Images and video" group. Each picture is a `media` row on the chat's costs.
- No table: the tool returns the stored file's URL, and the card shows it.
- Verified with pnpm check, the tests (the tool is offered in the chat but not in texts or calls) and one picture made on `dev/matilda`: a 1536x1024 PNG of 2.5 MB in 30 seconds, then deleted. The gateway sent no usage for it, so its cost shows as $0.

### Videos (2026-10-22)

- A `generate_video` tool makes an 8-second clip with Veo 3.1 Fast through the Convex AI gateway (`MODELS.video`), wide or tall. It returns at once: a `videos` row tracks it while an action makes the clip in the background and saves it in Convex storage. That action runs in Node (`models/videos/make.ts`): on dev, the default runtime ran out of its 64 MB holding the video.
- The chat card follows the row live: "Making the video", then a player, or why it failed. Only the workspace's owner can see it.
- Pictures and videos work on calls too, from the call panel or hands-free in the chat: the reply goes to the assistant's chat, so the card shows there beside the call (`showsVia` in `everyday.ts`). Other cards still stay out of calls, and all of them stay out of texts and email. Fast voice has no tools, so it can't make them.
- `/video` turns what you describe into a detailed prompt and says it takes a few minutes.
- Safe to run again: if the action dies, a check 12 minutes later (past the action limit) marks the video failed. A file that arrives late still lands, and nothing undoes a finished video.
- Verified with pnpm check, the tests (a video lands for its owner only, a failure says why, finishing converges) and two videos on `dev/matilda`. The first ran out of the default runtime's memory, and the 12-minute check marked it failed. The second, in Node, took 95 seconds: a 5.1 MB MP4 costing $0.80. Both were deleted afterwards.
- The Models page lists it under "Images and video". Each video is a `media` row on the chat's costs.

### Follow-ups with Jev (2026-10-22)

- A `needs_follow_up` tool asks Jev, in one call, whether the assistant still owes you something from the chat, and which of your requests it is. It covers a request not done or answered, a tool that failed, a promise to do it later (like Fast voice's "ask me in the chat"), and work still open in the chat (videos being made or failed, tasks running, waiting or failed).
- It reads the chat's last 30 messages, with which tools ran and failed, and `threads.openWork`. It works in chats, texts and calls, and in email drafts, since it only reads.
- The assistant uses it when you come back after a while, at the start of a call, or when you ask what's left, then follows up on what it finds.
- Verified with pnpm check, a test that both questions go to Jev in one call and the open request is named, and two live checks on `dev/matilda` in half a second: a video still being made needed a follow-up (0.97) and named that request; a question already answered didn't (0.03).

### Sending no longer jumps the chat (2026-10-22)

- Your sent message was a scroll anchor, so the chat moved it to the top and pushed everything up. Now the chat stays at the bottom as replies come in.

### Copy buttons (2026-10-22)

- Copy on every message (yours and replies, just the words, not the cards) and on every code block, shown on hover on desktop and always on phones. Drafts and post previews use the same `CopyButton`, which says Copied for a moment and announces it to screen readers.

### Diagrams in Excalidraw (2026-10-22)

- A `draw_diagram` tool: the assistant writes the diagram as Mermaid, and the chat shows it on an Excalidraw canvas you can edit, with PNG and .excalidraw downloads (open the file on excalidraw.com to keep going there). `/draw` asks for one.
- Excalidraw and the Mermaid parser load with the first diagram, not with the app. `@excalidraw/mermaid-to-excalidraw` is pinned at 2.2.2, since 2.3.0 is a day old.
- Cards only show in the app, so texts and calls don't get it.

### Solving Convex problems fast (2026-10-22)

- A `convex_docs` tool searches the live Convex docs (the `llms.txt` index, then the best three pages as markdown), so every assistant answers Convex questions from today's APIs and links the page. It works everywhere, email drafts included, since it only reads.
- `/convex`: most likely cause in one line, the fix as code, how to check it, the docs page. `/fix` does the same for any problem, with web_search.
- Pages rank by the words they share with the question. Live, "paginate a query" and "schedule a function later" found the right pages in about 0.7 seconds each; vaguer questions find nearby pages, and the assistant can search again.

### Make my problems go away (2026-10-22)

- `/make-my-problems-go-away` runs `problem_check`: Jev answers, in one call, who should handle the problem (AI alone, AI then a person, or a real person) and whether getting it wrong could really hurt.
- The card plays a short, silly scan (four steps and a filling bar, still for reduced motion), then shows the verdict, the odds for each and a warning when it's risky. The assistant follows with what it can do now and who to see. It gives emergency help first if you may be in danger.
- Verified with a test and live on `dev/matilda`: a polite email to a landlord went to AI (0.77), a risky lease clause to a person (0.57, risky), chest pain to a person (0.86, risky). One earlier try failed with a network error and passed on retry.

### Every assistant's chat is recorded, with no guessing (2026-10-22)

- A review of #68 found that guessing an assistant's chat looked at only the newest 20 chats and 10 phone links. An app chat behind 20 channel chats was lost to a new one, an 11th link's chat could become the main chat, and a wrong guess stuck forever.
- Now `getMainThread` only reads the pointer on the project or bot, and `ensureMainThread` reads it or starts a chat. Two first messages at once can't both start one: they read and write the same row, so Convex retries the second and it finds the first's.
- `threads.recordMainThreads` records the chats that were never recorded, one time, from old chats with no caps (every linked phone's chats and email's are left out), ten workspaces a run. Running it again changes nothing. On `dev/matilda` it recorded two workspaces' chats; a second run changed nothing.
- Verified with a test of the review's case (an app chat behind 20 channel chats from 11 linked phones and a mailbox: nothing guessed before, the right chat after, nothing changed on a second run).
- Run it once on production after deploying: `pnpm exec convex run api/threads:recordMainThreads '{"cursor":null}' --prod`.

### Email fixes from the #69 review (2026-10-22)

- Reply buttons no longer stop after 100 emails in a chat: `emails.forMessages` looks up the messages on screen by their id (new `by_chatMessageId` index) instead of loading the newest 100 emails of the chat.
- Two clicks on Send can't send twice: `claimReply` sets `repliedAt` in a transaction before Photon is called, and `unclaimReply` gives it back if sending fails.
- `READ_ONLY_TOOLS` and the email draft's tools are checked by a test, so a misspelled tool can't be dropped without notice. Typing them against `assistantTools` made a type cycle through the generated API.
- Stale comments on `emails.status` and `threads.memberIds` updated. The cold-path guessing is gone in #96.
- Not done: splitting `emails` into a union by status (ignored rows have no sender), which needs a migration of old rows.
- Verified with pnpm check and tests: 120 newer emails and the oldest still gets its button; two Sends at once send one reply and post one "Replied".

### Fixes from Cursor's review of every open PR (2026-10-22)

- Critical: the hourly file sweep (#86) deleted any unreferenced file over an hour old, which now included pictures and videos. It now only removes command markdown and call audio (`sweepable`); pictures, videos and anything else stay. The picture tool also returns its storage id.
- #96: a message before `recordMainThreads` ran started a new chat. Now an unrecorded assistant's old chat is found with no caps on the way in, so the backfill only saves the lookup.
- #74: today's emails were the newest 100 of everyone's, then filtered to yours; now by user (`by_user_and_receivedAt`).
- #75: the first add to the cart is held to 1 to 20, like later ones.
- #78: daily briefings read the first 500 news settings; now every one with a daily time, by `by_dailyHour`.
- #85: a silent clip on Fast voice no longer plays or keeps the reply it cut off.
- Smaller: texts over the limit aren't kept for find_texts (#70); a missed-call text that couldn't go out says so (#71); no link on a price watch without a URL (#76); "Keep up to date" waits a full period (#79); needs_follow_up names no request when nothing's owed (#90); a diagram that fails to parse can be tried again (#93).
- Left as is: a reply whose chat line fails after Photon sent it stays Replied (it was sent); plan titles beyond the newest 50 (#73); a union type for emails; #67's DoH status (on its own branch).

### Security review fixes (2026-10-22)

- Email can't pose as you: every email, your own address included, is quoted in the chat (`> ` lines under its header), never saved as your words, since From can be forged and Photon gives no SPF or DKIM result. Your own email is still drafted with the chat's history, as information, and that turn isn't saved; the draft is in the Reply box.
- `save_command` only adds commands. It can't replace one you have, so a planted instruction can't change what /name does later.
- Markdown images in the chat render as links, so an email body can't fetch a tracking pixel when you read it.
- A bad email no longer stops the email check: it's recorded as ignored and the next one is handled. Subjects and sender names are capped.
- Reply buttons: the newest 500 messages on screen, instead of an error past 500.
- Catalog product links and images must be web URLs; others are dropped.
- The hourly sweep leaves files with no content type alone, and uploads always send one.
- `generate_video` needs a chat; `emails.reply`, `pages.save` and `shopping.addToCart` validate with zod.

### Excalidraw dropped (2026-10-22)

- The `draw_diagram` tool, `/draw` and the diagram card are gone, with `@excalidraw/excalidraw` and `@excalidraw/mermaid-to-excalidraw`. Their Mermaid parser pulled in 13 `pnpm audit` holes (nanoid, lodash-es, katex) and an unfixable one in `braces` through `sass`. The audit is clean now. A diagram tool can come back with a lighter renderer.

### An AI budget per person (2026-10-22)

- `@convex-dev/ai-budget` meters every gateway call per user and refuses one that would pass their month's cap: $12, or `AI_BUDGET_USD` on the deployment (30 on dev). The cap is given to a user before their first metered call (`ensureBudget`, once per isolate), so no backfill.
- Chat models go through `budgetedModel(ctx, userId, id)`, which the agents, web search, research, quick summaries and news use. Pictures, videos, transcription, speech on calls, Fast voice and Jev decisions go through `metered`, which holds an estimate first (8 cents a picture, 80 a video, a cent or less for the rest) and charges the gateway's real cost after. Pictures count as 8 cents, since the gateway sends no cost for them yet.
- Over the cap, the chat says so instead of failing, a call reads it out, and a text says it. The Costs tab shows this month's spend against the cap.
- The deployment's own ceiling is the gateway's spend limit in the Convex dashboard; the component's global cap isn't set.
- Verified with pnpm check, the tests (`lib/budget` is mocked by `test.budget.ts`, which hands back each test's mocked models) and live on `dev/matilda`: one call cost $0.0000096 from the gateway's own figure, and a one-cent cap refused the next with "You've used this month's AI budget".

### Dead code (2026-10-22)

- knip found two unused UI files (`card`, `collapsible`), three packages left from the WhatsApp removal (`@grpc/grpc-js`, `nice-grpc`, `nice-grpc-common`) and twelve exports nothing imports (`TaskCard`, `useVoiceCall`, the turn-taking thresholds, four types). The files and packages are gone; the exports are plain locals now. shadcn's spare exports stay.

### Reads in `queries.ts`, contexts in `lib/ctx.ts` (2026-10-22)

- Each table's read helpers (`getOwnedProject`, `getOwnedThread`, `findContacts`, `getCommands` and the rest, twelve tables) live in `convex/models/<table>/queries.ts`; `functions.ts` keeps the registered functions and the writes. The `MAX_*` limits moved with the reads that apply them.
- `convex/lib/ctx.ts` re-exports `QueryCtx`, `MutationCtx`, `ActionCtx`, `Doc` and `Id`, plus `Db = Pick<QueryCtx, 'db'>`, which 24 helpers had spelled out. No file under `models/` or `lib/` imports types from `_generated` any more.
- No behavior change: pnpm check and all 186 tests pass.

### Arrow functions (2026-10-22)

- Every function in `convex/`, `src/lib/` and `src/hooks/` is an arrow function now (198 converted by a codemod), except one generator, which is a function expression. React components stay declarations. ESLint's `func-style` keeps it that way, and the rule is in the table in AGENTS.md.

### The old chat fields are gone (2026-10-22)

- `mailboxes.threadId`, `inboxThreadId`, `phoneLinks.threadId`, `botThreads` and `activeBotId` are out of the schema. A one-off mutation unset them on `dev/matilda` first (one mailbox, one link; a second run changed nothing). Production has no rows from before, so nothing to run there.
- With them went the lookup of an assistant's old chat and `recordMainThreads`: every assistant's chat is recorded on it, and a new assistant starts one on its first message.

### Shopping is a Convex component (2026-10-22)

- A trial of the component pattern: `convex/components/shopping/` has its own `convex.config.ts`, schema (`details`, `items`, `watches`, with user ids as strings) and functions (`details.get/save`, `cart.add/list/setQuantity/clearShop`, `watches.start/get/stop/due/recordCheck`), and the app registers it with `app.use(shopping)`. Its functions carry `returns` validators, since the generated component types are `any` without them.
- The app's `models/shopping/functions.ts` is wrappers now: they check who you are, look the catalog up (`lib/shopify.ts` stays in the app) and hand the component your user id. The hourly price check reads due watches from the component and posts what it returns in the chat. The UI and the tools call the same `api.api.shopping.*` names as before.
- `shoppingDetails`, `cartItems` and `priceWatches` left the app schema; dev had no rows in them. Tests register the component with `registerShopping(t)` from `test.setup.ts`.
- Verdict on the pattern: it fits a feature that only needs its own rows and a user id. Threads, emails and texts write into the agent's thread, so they'd stay in the app.

### Tests in their own folders (2026-10-22)

- Backend tests live in `convex/tests/<table>/` and `convex/tests/lib/`, frontend ones in `src/tests/`. Only the relative imports changed. `test.setup.ts` and `test.budget.ts` stay at `convex/`, since convex-test keys modules by paths from there.

### Spectrum is back: iMessage, WhatsApp and Telegram through Photon's SDK (2026-10-22)

- `@spectrum-ts/convex` is mounted again, with `@spectrum-ts/core`, `imessage`, `telegram`, `whatsapp-business`, `@photon-ai/advanced-imessage` and the gRPC packages they need, at the versions the app ran before #71. The `SPECTRUM_*` and `TELEGRAM_BOT_TOKEN` env vars are declared again; dev still had the two Spectrum keys.
- Back as they were: `/spectrum/webhook`, the `respond` batch handler (one turn per burst of texts, replies through the outbox), the Node `sender` (iMessage through Photon's cloud sender, Telegram and WhatsApp through their SDK providers), reminders texting through the outbox when a chat wasn't linked on the platform API, `find_texts` by app, the iMessage and WhatsApp channels on Connections, the Messaging page for any app, and the setup docs.
- Telegram through the platform API (`/photon/webhook`) stays as it is; a chat linked there keeps replying that way.
- Verified with pnpm check and the tests (189, the Spectrum ones restored: a failed reply still texts back, an ignored message closes its turn, replies go out through each app's provider). Dev remounted the component cleanly. pnpm audit is still clean.

### Voice settings on calls (2026-10-22)

- A gear in the call panel's header opens three rows, kept on this browser like the volume: **Voice** (a Kokoro voice, or the assistant's own; Fast voice lists its own voices), **Speed** (0.75x to 1.5x) and **Language** (auto, or one of eleven).
- The voice and language go with each turn: the voice is spoken in, the language is passed to Whisper as a hint and to the reply as "Speak French.", on Fast voice too.
- Speed is the browser's: replies now play through `<audio>` elements routed into the call's volume and level meter, so a faster speed keeps the pitch, and a change applies to the piece playing. Pausing when you talk over a reply resumes from the same second as before.
- Verified with pnpm check and the tests (the voice reaches the speech model, the language reaches transcription and the reply's instructions). The panel isn't tried in the browser.

### One thread per assistant, and no threads table (2026-10-22)

- The app's `threads` table is gone. The agent component's threads are the only threads: each assistant's chat is recorded on it (`projects.threadId`, `bots.threadId`), and `assistantOf(threadId)` finds the assistant by those. Owners are checked through the component's thread (`ownsThread`), so nothing of ours stores who a thread belongs to.
- No sub-threads. `ask_bot` runs in the bot's own chat, where it sees what it's been asked before and the user can read it (the card opens that chat). A task's steps and a page refresh run in the chat's thread with nothing saved there: the task card and the page are the result, and each step is told what the earlier steps found.
- A chat is its assistant, so the chat header's model, effort and members now set the assistant's own (`threads.setModel`, `setEffort`, `setMembers` take the project and bot). "Default" on the menus is the app's default. Members live on `bots.memberIds` and `projects.memberIds`.
- Dev: a one-off moved 15 chat rows' members, model and effort onto their assistants and deleted 5 sub-thread rows. Production has no rows from before.
- Verified with pnpm check and the tests (190: the ask lands in Ivy's chat, six asks make six turns there, a model picked before the first message is the one it starts on).

### A cheaper Telegram check (2026-10-22)

- The fast check after a Telegram message ran every 3 seconds for 2 minutes, re-recording every message of the last 3 minutes each time: about 40 checks and 120 function calls per message. Now one query says which messages are new before anything is recorded, the check runs every 3 seconds for 30 seconds and then every 10, and a second message can't start a second loop: the row remembers the scheduled run and checks it's still pending.
- It was never endless: the window ends 2 minutes after the last message, and dev's logs showed it stopping on time.


### No call button in the chat header (2026-10-22)

- The phone button at the top right of a chat is gone, with the `onCall` prop that fed it. Calls still start from the voice bar in the prompt and from incoming calls.

### Matilda calls again (2026-10-22)

- Answering a reminder call opens it in the call bar under the chat input. The side panel is gone; its voice settings and Fast voice moved into the call bar, and a small "On a call with …" pill shows on other pages.
- The incoming call has a Snooze button: it rings again in 10 minutes.
- Missed or declined, Jev decides what's next: call again in 10 minutes or an hour, text you, or leave it in the chat. Code caps it at 3 calls, keeps call-agains between 9am and 9pm in your time zone, and texts only when texting is linked. The chat says when she'll call again.
- Your time zone is saved from the chat (`users.timeZone`).
- Findings, every Jev judgment, the limits and the next PRs: `docs/decisions/2026-10-22-calls-and-reminders.md`.
- Verified with pnpm check and the tests (195), including call-again, the cap, 9am, snooze and decline. Not rung live: no test calls.

### Recurring reminders (2026-10-22)

- "Every weekday at 9" works. Jev decides whether a reminder you ask for happens once or repeats (daily, weekdays, weekly, monthly or a custom cron). Once uses the scheduler as before; repeats use the `@convex-dev/crons` component, in your time zone.
- Each time a repeat comes due, Jev checks the recent chat: it stops one that sounds done, pauses one you need a break from, skips one you already did, and only switches between chat, text, call and email when it's sure (0.7). Each stop or pause is explained in the chat.
- Pause, Resume and Stop are in the Library's Reminders; the details panel shows "every weekday, from …" or Paused.
- luxon does the date math now (`inDaytime`, `cronFor`, labels), and AGENTS.md says to keep using it.
- Verified with pnpm check and the tests (202), and pushed to dev.

### Check-in calls (2026-10-22)

- Once an hour, for people who messaged an assistant this week (but not in the last hour), Jev reads that chat and decides whether a short call now would help, and about what. At 0.7 or above the assistant rings: "Hi, it's Matilda. Checking in about: …".
- Limits: 9am–9pm in your zone, 3 a day, 2 hours from any other call or check-in, never right after you chatted. A missed check-in is left in the chat without another call. You can turn them off in Settings → Account.
- Found while testing: a rate limiter fixed window with no `start` begins at a random time, so "3 a day" could let a 4th through. Pinned to UTC days.
- Verified with pnpm check and the tests (207), and pushed to dev, where the hourly check is now running.

### Command pills (2026-10-22)

- Asked "what can you do?", an assistant calls `show_commands`, and the chat shows each command as a pill: your own first, then the built-ins it doesn't replace. Tapping one sends `/name`. The pills are off while a reply is running.
- Verified with pnpm check and the tests.

### Fewer write conflicts (2026-10-22)

From Convex's "high-throughput mutations via precise queries" post. A mutation conflicts with any write to something it read, so reads were narrowed and often-written fields moved off rows that many things read:

- **Hot and cold tables:** `users.lastChat` and `users.checkInAt` (written while you chat, and by check-in calls) moved to a new `userActivity` table, one row per user. The profile on `users` only changes when you edit it or your time zone changes, so the email, mailbox and reminder mutations that read it stop conflicting with chatting.
- **Precise queries:** `pages.due` read the 500 newest pages and filtered them in code. Pages now store `nextRefreshAt`, with an index, and it reads only the pages that are due.
- **Fewer writes to a shared row:** every Telegram message read and rewrote the one `telegramPolls` row, so messages from different people conflicted with each other and with the fast check. It's now written only when the loop needs a new run or the window moves by more than 15 seconds.
- **Bounded:** the daily-news scan read every row with a daily time; it now takes at most 1000.
- Dev had no rows to migrate. Verified with pnpm check and the tests (208), and pushed to dev.

### Attachments (2026-10-22)

- The message box takes pictures and PDFs: the paperclip, pasting a screenshot, or dropping files on it. Up to 5 files, 10 MB each. Each one shows as a chip while it uploads, and you can remove it before sending. A message can be only files.
- Files upload to Convex storage and are registered with the agent component (`files.addFile`). The message saves them as image and file parts with `metadata.fileIds`, so the model sees them and the component counts their references. Your bubble shows them as thumbnails and chips that open them.
- Only pictures and PDFs: the hourly `commands.sweepFiles` deletes markdown and audio that no command points to, so those would vanish. Pasted text already works.
- The server checks the type and size in `_storage`. The browser's type is used only when a file was stored without one (convex-test stores none).
- Verified with pnpm check and the tests (210), and pushed to dev. Every chat model reads PDFs: see "PDFs work on every chat model" below.

### Edit and retry (2026-10-22)

- The last reply has a Retry button: it answers your last message again, in place of the old reply.
- Your messages have an Edit button: change the text and send, and the assistant answers that instead. Everything after it is dropped, and the edit box says so. Attachments on the message stay.
- One mutation, `chat.redo`, does both. It checks the chat is yours and the message is one of yours, refuses while a reply is still running, rewrites the text with the agent component's `updateMessage` when editing, drops later messages with `deleteByOrder` (which also stops their streams), and schedules `chat.respond` again, running a `/command` again if the message has one.
- Verified with pnpm check and the tests (213), and pushed to dev.

### Flash cards and quizzes (2026-10-22)

- A new `study` component keeps decks and their review schedule. Ask in the chat ("quiz me on Spanish greetings"), run `/study` or `/quiz`, or use New deck in the Library's Study section: you choose flash cards or a quiz, how many, and the level. The assistant asks one short question if you didn't say which or how many.
- The deck shows as a card in the chat and in the Library. Flash cards flip, and you mark them Again, Hard, Good or Easy. Quiz questions are multiple choice or answered in your own words, which Jev checks for meaning. Each answer schedules the next review (SM-2, simplified), and the Library shows how many are due.
- When cards are due, the hourly check-in can call to review them; that call opens with up to 5 questions. Grading answers given by voice is a follow-up.
- Verified with pnpm check and the tests (218): review spacing, quiz clean-up, ownership, Jev grading, and the review call. Pushed to dev; the component is installed there.

### A cheaper email check (2026-10-22)

- The email check (every minute, and on each webhook email event) ran the `receive` mutation for every email of the last 10 minutes, already recorded or not. Now one query (`emails.unseen`) says which are new first, so a quiet minute costs one query instead of one mutation per recent email.
- A webhook email event used to start a full check right away, so a burst of mail ran several checks side by side. It now queues one check 2 seconds out unless one is already queued (`emails.schedulePoll`, with its scheduled run kept on the one `emailPolls` row, written only when queuing).
- Same shape as the Telegram fix (#112). Verified with pnpm check and the tests (210), and pushed to dev.

### Task steps aren't retried on their own (2026-10-22)

- A task step that failed was retried automatically, up to the workflow's default number of attempts. Each try paid for the model again, and a step that had already set a reminder or added to a list could do it twice. Now a failed step stops the task once (`retry: false`).
- The stopped task's card has a **Try again** button (`tasks.retry`). It restarts the workflow from the step that failed, with `restart(…, { from: doStep })`. The steps before it keep their results and aren't paid for again. The chat says to press it.
- Verified with pnpm check and the tests (221): a failing step runs once, and Try again runs only that step, then finishes the task.

### Answers by voice on a review call (2026-10-22)

- A review call opened with the due questions, but nothing recorded what you said back. Assistants now have `due_cards` (up to 5 due questions, with their ids) and `check_answer` (Jev grades your words against the card, then records good or again on your review schedule, like a typed answer). They work by voice on a call and in the chat. Fast voice can't use tools, so it can't grade.
- The typed check on quiz cards and the spoken one share `checkAnswer`, which looks the card up by id through a new component query (`decks.ownItem`) that only returns your own cards. `check_answer` isn't read-only, so email drafts don't get it.
- Verified with pnpm check and the tests.

### PDFs work on every chat model (2026-10-22)

- Checked on dev with a one-page PDF ("The secret word is MARMALADE."), sent the way an attachment is: a Convex storage URL in a `file` part with `application/pdf`. All 10 chat models answered MARMALADE: Claude Sonnet 5, Opus 5 and Haiku 4.5, GPT-5 and GPT-5 mini, Gemini 2.5 Pro and Flash, DeepSeek V3.2, Grok 4.7 and Muse Spark 1.3. So no model needs PDFs turned off.
- The check was a temporary dev-only function, deleted after the run along with its PDF. It cost a few cents.

### Jev's thresholds, ready to tune (2026-10-22)

- Asked to tune the thresholds from real answers, but dev had none: 4 reminders in all, no check-ins, no recurring reminders, and Jev's answers weren't kept anywhere. So nothing moved yet; instead they can now be tuned.
- One place: `JEV_THRESHOLDS` in `convex/lib/decide.ts` (stop a recurring reminder under 0.3, switch its channel at 0.7, call to check in at 0.7, a right answer at 0.5). The four call sites read it.
- Every Jev answer that code acts on is kept in a new `judgments` table: the kind, Jev's probabilities, its pick, and what the code did (`called`, `no_call`, `over_the_limit`, `stop`, `send_by_call`, `right`, and so on). `pnpm exec convex run api/judgments:summary '{"kind":"check_in"}'` shows the outcomes and how each score spreads over tenths.
- Verified with pnpm check and the tests, and pushed to dev.

### Email: one idempotency key per Photon call (2026-10-22)

From the Photon review (finding #7). `sendEmail` sent the same idempotency key to `/spaces` and to `/messages`. If Photon scopes keys per project rather than per endpoint, the message call would get the thread's cached response back and the email would never go out. Each call now gets its own key (`…:space`, `…:message`), so retries are still safe.

Not done (finding #6): every email sent still looks up both Photon users first, 4 calls in all. That's only reminder emails and messages to contacts, a few a day, so caching the user ids isn't worth a table yet.

### luxon everywhere, enforced (2026-10-22)

- Dates and times now go through luxon on both sides. `convex/lib/time.ts` holds the shared helpers, used by the backend and the browser: `zoned`, `isTimeZone`, `iso`, `parseIso`, `localDayHour`, `localTimeZone`. Converted: emails, texts, calls, reminders, the lead's "it is now", find_emails/find_texts/set_reminder, the time-zone comparison and the daily news hour on the backend; call history, the news, today, time zones, post preview and reminder cards, and the browser's time zone on the frontend.
- ESLint now refuses `new Date()`, `Date.parse`, `Date.UTC`, `toISOString`, `toLocaleDateString`, `toLocaleTimeString` and `Intl.DateTimeFormat` outside the tests, pointing to `convex/lib/time.ts`. A date's `toLocaleString` can't be told from a number's by syntax, so that one stays judgment. AGENTS.md says so.
- Verified with pnpm check and the tests (223), and pushed to dev.

### Texts: a replaced turn doesn't pay (2026-10-22)

From the Photon review (finding #5). In collapse mode a newer text replaces the turn before it, but `respond` only checked that after the model had answered, so a replaced turn still paid for its reply and saved it in the chat. It now checks before calling the model too. A text that lands in the few seconds while the model is already running still pays for that reply. Stopping mid-way needs a timer that checks during generation, and that's left until costs show it's worth it (`ponytail` note in `respond`).
- New test: a second text that lands while the first reply is queued means one model call and one reply. It fails without the check.
- Verified with pnpm check and the tests (224), and pushed to dev.

### `@convex/…` instead of `../../../../../../convex/…` (2026-10-22)

- The frontend imported the backend through relative paths up to six levels deep (97 imports). `tsconfig.json` now has an `@convex/*` alias next to `~/*`, and Vite reads it through `resolve.tsconfigPaths`, so they read `import { api } from '@convex/_generated/api'`.
- ESLint refuses a relative path into `convex/` from `src/`, and AGENTS.md says so. Backend files keep their short paths within `convex/`.
- A running dev server only picks up a new alias after a restart; it 500'd until it was restarted.
- Verified with pnpm check (build included), the tests (223), and the dev server serving the app after a restart.

### Fewer subscriptions on the frontend (2026-10-22)

- **The details panel** subscribed to everything for all its tabs as soon as it opened: bots, connectors, reminders, tasks, plans, usage and budget. Each tab is now its own component with its own queries, and Base UI unmounts a hidden tab, so only the open tab subscribes. The default Details tab went from 7 subscriptions to 2.
- **The chat** asked which messages are emails, passing every message id. That re-subscribed with new arguments on every message, in every chat. Only messages starting with 📨 can be emails, so it now asks about just those, and skips the query when there are none, which is most chats.
- **The incoming-call ring** query is skipped during a call, since nothing rings over one.
- Already fine: transcripts load only when opened, and identical queries (like `bots.list` in the sidebar, chat header and search) share one subscription in the Convex client.
- Verified with pnpm check and the tests (223).

### A sturdier frontend (2026-10-22)

- **Clicks don't fail silently:** 32 buttons, menus and checkboxes fired a mutation with `void`, so a failure (offline, over budget, already gone) showed nothing and surfaced as an unhandled rejection. They now go through `attempt` (`src/lib/attempt.ts`), which shows the error as a toast (sonner, added) with the server's message when there is one.
- **One click at a time:** the one-shot buttons wait while they run, via React's `useTransition`: the task card's Start, Don't start, Try again and Cancel, the contact message's Send and Cancel, and the incoming call's Snooze and Decline.
- **Cards don't pop in or vanish:** six chat cards (task, page, video, price watch, checklist, study deck) rendered nothing while loading, so the chat jumped when they arrived. They show a skeleton the size of a card now. The task and price-watch cards also say when what they showed was removed, instead of disappearing.
- **Error pages:** a crashed page showed users a raw stack trace, and an unknown URL showed "not found" in plain text. There's now an error page with Try again and Home (the stack only in development), and a proper not-found page.
- Verified with pnpm check and the tests (223), and the not-found page on the dev server.
