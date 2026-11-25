# Plan: simpler, faster, less scattered

Surveyed 2026-11-06 on master at 218f4fc (#183). This is a plan only: nothing here has been refactored yet.

**tl;dr**

- Fix in-app voice latency first, because slow replies are breaking calls. Measure, then take the workflow off the turn path, then stop the reply from waiting on Jev.
- Delete before moving anything: dead exports, a duplicate transcription path, and (if you agree) the Spectrum SDK texting path, which is a second inbound route for Telegram.
- Fewer folders per feature: keep each topic's tools next to its table, and fold the two trial components back into `convex/models/`.
- No workspace packages yet. The only good candidate is the SIP/RTP phone stack. Split it out of `placeCall` into `convex/lib/phone/` first, and promote it to `packages/sip` only if something else needs it.

## 1. Current shape

| Where                           | Files               | Lines            | Notes                                                                                                                                        |
| ------------------------------- | ------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/` (minus `ui/`, routeTree) | ~110                | 12.3k            | Biggest files: `voice-call.tsx` 958, `assistant-panel.tsx` 508, `markdown-editor.tsx` 450, `library.tsx` 434, `prompt-form.tsx` 426          |
| `convex/models/`                | 70                  | ~10k             | Biggest: `calls/dial.ts` 863 (`placeCall` alone is ~600 lines), `reminders/functions.ts` 841, `threads/tools.ts` 785, `threads/calls.ts` 764 |
| `convex/api/`                   | 29                  | tiny             | Re-exports only. 7 of them aren't tables (`dial`, `sender`, `checkIns`, `videoMake`, `voice`, `chat`, `auth`)                                |
| `convex/lib/`                   | 29                  | ~4k              | `decide.ts` 517 holds every Jev question for every feature                                                                                   |
| `convex/components/`            | `shopping`, `study` | ~630 + generated | Progress.md calls shopping "a trial of the component pattern"                                                                                |

### Features that sprawl

| Feature               | Backend folders it touches                                                                                         | What's scattered                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voice and calls       | `models/threads`, `models/calls`, `lib` (6 files: audio, sentences, transcript, sip, rtp, phone)                   | **Three turn engines**: in-app `turnStep` (STT, Jev routing, agent, Kokoro TTS), in-app `fastStep` (`audioChat`, one request), and phone `placeCall` (`audioChat` plus its own `transcribe`). The frontend side adds 4 components, 3 `src/lib` files, a hook and a worklet |
| Texting               | `models/texts` (6 files), `lib/photon`, `lib/webhooks`, `lib/limits`, the `spectrum` component, `models/reminders` | Two inbound paths: `POST /photon/webhook` (live Telegram) and `POST /spectrum/webhook` plus `sender.ts` (Spectrum SDK: iMessage, WhatsApp and Telegram again). `reminders/functions.ts` calls `spectrum.send` directly                                                     |
| Shopping              | `components/shopping`, `models/shopping`, `models/threads/shopping.ts`, `lib/shopify.ts`                           | 4 places. `models/shopping/functions.ts` only wraps the component and hands it string user ids                                                                                                                                                                             |
| Study                 | `components/study`, `models/study`, `models/threads/study.ts`                                                      | Same wrapper pattern as shopping                                                                                                                                                                                                                                           |
| Pages, everyday tools | `models/pages` + `models/threads/pages.ts`; `models/threads/everyday.ts`                                           | The tools live in `threads/`, away from the tables they write                                                                                                                                                                                                              |
| Email                 | `models/emails`, `models/mailboxes`, `lib/mail`, `lib/handles`, `lib/photon`                                       | Acceptable: two real tables plus one client                                                                                                                                                                                                                                |

## 2. Packages: which boundaries are worth it

`pnpm-workspace.yaml` already exists (for overrides), so adding `packages:` costs little. A package earns its keep only when the code has **no app knowledge**, gets **tested on its own**, and would otherwise blur a big file. A Convex component earns its keep only when the code **owns tables** and needs isolation from the app's schema.

| Candidate                                                                                                                  | Fit                                                      | What it buys                                                                                                                                                | Verdict                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SIP/RTP phone stack: `lib/sip.ts`, `lib/rtp.ts`, plus STUN (`askStun`, `publicAddress`) and `openSip` from `calls/dial.ts` | Package (pure Node: `dgram`, `tls`, `crypto`, no tables) | Separates the protocol from the conversation. Today `placeCall` mixes SIP dialogs, RTP pacing, hold detection and the AI turn loop in one 600-line closure  | **Split now, as a folder** (`convex/lib/phone/`). Promote it to `packages/sip` only when a second user appears, such as a standalone dialer test harness. A component buys nothing here: there are no tables |
| Photon/Spectrum messaging: `lib/photon.ts`, `models/texts/`                                                                | Neither                                                  | `photon.ts` is a 233-line fetch client tied to the app's env. Spectrum is already a component (theirs)                                                      | Keep it in the app. Delete one of the two inbound paths (PR 5)                                                                                                                                               |
| Audio/voice: `lib/audio.ts`, `lib/sentences.ts`                                                                            | Neither                                                  | ~250 lines, used by two engines                                                                                                                             | Keep in `lib/`. Move `AUDIO_VOICES`/`audioVoiceName` to `lib/models.ts` next to `VOICES`, so `voice-call.tsx` stops importing a file that imports `convex/server`                                            |
| Shared time/phone helpers: `lib/time.ts`, `lib/phone.ts`                                                                   | Neither                                                  | The browser already imports them through `@convex/lib/*`                                                                                                    | No change. A package would add a build step for the same import                                                                                                                                              |
| Shopping, study components                                                                                                 | Plain models                                             | The trial gave isolation nobody uses, and cost a wrapper for every function, `any`-typed generated APIs that need `returns` validators, and string user ids | **Fold back into `convex/models/<table>/`** (PR 8), once you've checked prod's rows                                                                                                                          |

### If `packages/sip` happens later

```
pnpm-workspace.yaml   packages: ['packages/*']   (keep the existing overrides)
packages/sip/
  package.json        "name": "@matilda/sip", "type": "module", "exports": { ".": "./src/index.ts" }
  src/sip.ts  src/rtp.ts  src/stun.ts  src/session.ts  src/*.test.ts
package.json          "@matilda/sip": "workspace:*"
```

To keep the rules enforced:

- Add `packages/**/*.ts` to the `func-style` and luxon `no-restricted-syntax` blocks in `eslint.config.mjs` (both are globbed to `convex/**` and `src/**` today).
- Add `packages/*/src/**/*.test.ts` to `vitest.config.ts`.
- Import the package only from `'use node'` files, because it uses `node:dgram`/`node:tls`. Convex's esbuild bundles TS reached through the workspace symlink. Confirm with `pnpm exec convex dev --once` on dev (`strong-bear-866`) before merging.
- The `convex/models/<table>/functions.ts` layout rule only polices `convex/*.ts`, so a package doesn't touch it.

## 3. Delete

Deletions are cheap and low-risk, so they go before any moving.

- `convex/lib/ai.ts`: `summaryModel` and `researchModel` are never used. Tools build these through `budgetedModel(…, MODELS.summary/research)`.
- `export` keywords nothing imports: `lib/audio.ts` `streamedJson`, `base64ToBytes`; `lib/decide.ts` `HANDLERS`, `AFTER_MISSED`, `HOW_OFTEN`, `RECURRING_ACTIONS`; `lib/handles.ts` `HANDLE_MIN/MAX`; `lib/sentences.ts` `MIN_PIECE`; `lib/mail.ts` `MAX_PROMPT_CHARS`; `comments/queries.ts` `botById`, `commandById`; `commands/queries.ts` `getCommand`; `threads/calls.ts` `SPEECH_TIMEOUT_MS`; `src/lib/turn-taking.ts` tuning constants; `identify-user.tsx` `SIGN_IN_METHOD_KEY`. (From knip and a grep. knip doesn't scan `convex/`, so treat this list as a floor.)
- Duplicate transcription: `calls/dial.ts:607` calls `metered(… transcribe(…))` itself. Use `transcribeBytes` from `threads/chat.ts`, then move `transcribeBytes`/`transcribeClip` into `lib/audio.ts`, since three engines use them.
- Two Jev calls per voice turn: `quickScore` and `hangUpScore` each send `conversation` to `MODELS.callDecide`. `experimental_decide` takes several `questions`, so ask `quick` and `over` in one request.
- **Your decision: the Spectrum SDK path.** If iMessage and WhatsApp aren't coming back soon, delete it: `models/texts/spectrum.ts`, `sender.ts`, `batch`/chain handling in `texts/functions.ts`, the `spectrum` component and route, `spectrum.send` in reminders, and the deps `@spectrum-ts/*`, `@photon-ai/advanced-imessage`, `@grpc/grpc-js`, `nice-grpc*`, plus the `@opentelemetry/core` override that exists only for `@photon-ai/otel`. Telegram stays on the Photon webhook. Check first that no prod user's linked chat is iMessage or WhatsApp.
- Not dead, though knip says so: `public/loudness-worklet.js` (loaded by URL) and `tsrs` (a deliberate local type checker, per progress.md).

## 4. Speed

### In-app voice (broken: slow replies make people talk again, which cancels the turn)

What a turn does now (`convex/models/threads/calls.ts`):

1. The browser uploads the WebM clip to storage, then calls `startTurn`.
2. `startTurn` starts a **workflow** (`runTurn`) whose only step is one action with `retry: false`. The clock (`startedAt`) starts here.
3. `turnStep` → `hearTurn`: storage get and delete, then Whisper through the gateway (`metered`, so two budget-component mutations around it), then the `heard` mutation. `heardMs` is about 3.9 s on prod.
4. The `conversation` query, then **`quickScore` (Jev) awaited serially** before `runReply` starts. `textMs` adds 3.5 to 6 s.
5. Each piece: `synthesize` (Kokoro, `metered` again), `ctx.storage.store` + `getUrl`, an `isCurrent` query, then the `updateLive` mutation. The browser then fetches the URL. `firstMs` adds 2.4 to 5.8 s.

`heardMs`, `textMs` and `firstMs` are already saved on each call line (`models/calls/table.ts`). What's missing is the split _inside_ each one.

Likely wins, biggest and surest first:

- **Take the workflow off the turn path.** It gives one non-retried step plus `onComplete`. Have `startTurn` call `ctx.scheduler.runAfter(0, turnStep)`, cancel the previous turn with `ctx.scheduler.cancel` (the `isCurrent` check already covers the race), and run `turnFinished` from `turnStep`'s `finally`. That removes the workpool queue before the step and between it and `onComplete`, which is the likeliest reason a short Whisper call shows up as 3.9 s.
- **Stop waiting on Jev before replying.** Prod's `voice_route` judgments so far: 3 of 4 routed `quick`. Start the quick (no-tools) reply as soon as the turn is heard, with Jev scoring in parallel, and hold its audio until the score lands. If Jev says tools, abort it and run the full assistant (`stop` and `cutOff` already exist). That saves the whole Jev round trip on most turns, at the cost of a wasted Haiku call on the rest. Simpler alternative if you'd accept it: make Fast voice (`fastStep`, one `audioChat` request, as phone calls already use) the default, and drop routing entirely. It has no tools.
- **One budget reservation per turn,** not one per TTS piece. `metered` runs `ensureBudget` plus `budget.meter`'s reserve and commit around every Kokoro call. Check the measured cost first.
- **Skip storage for small pieces,** if the store and fetch times say so: send the bytes on the `liveTurns` doc (well under 1 MiB for a sentence of MP3), or serve them from an HTTP action. That saves a store, a URL and a browser fetch per piece.

### Bundle (from `vite build` on this commit)

| Chunk                                           | Client                       | Server                     |
| ----------------------------------------------- | ---------------------------- | -------------------------- |
| `chart-part` (recharts)                         | 418 kB, already `React.lazy` | 1,063 kB                   |
| `markdown-editor` (tiptap)                      | 471 kB                       | 1,013 kB                   |
| `chat-message` (react-markdown, every `*-part`) | 244 kB                       | 775 kB                     |
| `index` (entry)                                 | 364 kB                       | 734 kB (`server/index.js`) |

- The client side is already split by route. The editor loads only on bots, library, pages and settings, and charts only when a chart shows. The win left there is `React.lazy` on `MarkdownEditor`, so those routes paint before tiptap arrives.
- The big numbers are **server-side**: the Worker carries every SSR copy. The signed-in app (`_app`) gets its data over Convex's websocket, so SSR does little for it. Try `ssr: false` on `src/routes/_app/route.tsx` (keep SSR for `_auth`, the landing page and the markdown/discovery routes from #180), then compare Worker size and cold TTFB before and after.

## 5. PRs, in order

Each PR stays under 2000 lines (`scripts/pr-size.sh origin/master`), passes `pnpm check`, and merges before the next starts. Broken or blocking work comes first, then the feedback loop, then the rest.

| #   | PR                                                                                                                                                                               | Size                       | Why now                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------- |
| 1   | **Time each voice step.** Split `heardMs` into queue, STT and save; `textMs` into route and first token; `firstMs` into TTS and store. Read the spread on prod                   | ~100                       | Broken. Decides what goes into 3 and 4 |
| 2   | **Voice turns without the workflow** (scheduler plus cancel, `turnFinished` in `finally`)                                                                                        | ~150                       | Broken. Surest single win              |
| 3   | **Reply while Jev decides**, and ask `quick` and `over` in one Jev call (or make Fast voice the default, your call)                                                              | ~250                       | Broken                                 |
| 4   | **TTS path**: one budget hold per turn, inline small pieces. Only what PR 1's numbers justify                                                                                    | ~200                       | Broken                                 |
| 5   | **Delete**: dead exports, the duplicate transcription, `AUDIO_VOICES` into `lib/models.ts`, and the Spectrum path if you approve it                                              | ~300 (Spectrum: ~800 more) | Cheap, and it shrinks everything after |
| 6   | **Bundle**: lazy `MarkdownEditor`, try `ssr: false` on `_app`, measure                                                                                                           | ~50                        | Speed                                  |
| 7   | **Tools next to their tables**: `threads/{pages,shopping,study,everyday}.ts` move to `models/<table>/tools.ts`. `threads/` keeps chat, lead, voice and the `assistantTools` list | ~700, mostly moves         | Sprawl. Update `features.md`           |
| 8   | **Fold `shopping` and `study` back into `convex/models/`** (tables into the app schema, typed `Id<'users'>`, wrappers deleted). Copy any prod rows with `@convex-dev/migrations` | ~1000 each, so two PRs     | Sprawl. Check prod row counts first    |
| 9   | **Phone stack out of `placeCall`**: `convex/lib/phone/` (sip, rtp, stun, a session object with audio in, audio out and hang up). `dial.ts` keeps the conversation                | ~900, mostly moves         | Sprawl. Leaves the package option open |

Not planned: splitting `voice-call.tsx` (958 lines, one feature, one place) and `reminders/functions.ts` (one table). Revisit if either keeps growing.

**Decisions for you:** keep or delete the Spectrum SDK path (PR 5), the parallel quick reply or Fast voice by default (PR 3), and folding the components back (PR 8).
