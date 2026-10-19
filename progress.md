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
