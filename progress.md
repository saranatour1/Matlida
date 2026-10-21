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

### DMARC on Connections, and email can't take actions (2026-10-21)

- Connections' Email row shows the mail domain's DMARC: missing (anyone can send as the domain), several or unreadable, `aspf=s` (which fails Photon's `bounce.` return path), `p=none` (monitoring), or `quarantine`/`reject`, with a reminder when there's no `rua`. A daily cron looks up `_dmarc.<MAIL_DOMAIN>` over DNS-over-HTTPS and keeps the raw records in `domainChecks`; Check now does it at once. `convex/lib/dmarc.ts` parses them.
- Photon passes no DKIM, SPF or DMARC results for received mail, only a spam flag, so a forged From can't be caught. Replies to email now get only the tools that read or show (web search, research, find_contact, show_chart, preview_post, ask_bot); saving, scheduling, running and sending need the app. The email style tells the assistant so, so it offers to do it in the app instead.
- Verified with unit tests: the DMARC parser (policy, alignment, reports, missing, several), the DNS-over-HTTPS lookup joining split strings, Check now storing what Connections reads, and an email reply's tools.
