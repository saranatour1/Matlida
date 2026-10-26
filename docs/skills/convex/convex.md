# Convex

How to confirm Convex work in Matilda is correct, what each Convex component does here, and every model Matilda reaches through the Convex AI gateway. When `convex/convex.config.ts` or `convex/lib/models.ts` changes, update this page in the same PR (the `matilda-convex` skill says how). For where each feature's code lives, see [features.md](../features/features.md).

## Confirming the work

Go through these in order. Each step catches what the one before can't.

1. **Know which deployment you're on.** An exported `CONVEX_DEPLOYMENT` beats `.env.local`, so check both: `echo $CONVEX_DEPLOYMENT`, then `grep CONVEX_DEPLOYMENT .env.local`. Dev is `strong-bear-866` and prod is `knowing-magpie-554`. Both are shared, so writes there are real.
2. **Static checks: `pnpm check`.** `tsc -p convex` typechecks the backend, and ESLint enforces the layout rules: functions in `convex/models/<table>/functions.ts`, `@convex/…` imports in `src/`, arrow functions, luxon for dates. Then it builds. No CI runs this, so a change isn't done until it passes here.
3. **Tests: `pnpm test`.** convex-test runs every function against an in-memory backend (`convex/test.setup.ts:modules`). Tests live in `convex/tests/<table>/`, mirroring `convex/models/`. Run one folder with `pnpm test convex/tests/calls`.
   - The AI is mocked. Tests mock `lib/ai` with fake models, and swap `lib/budget` for `convex/test.budget.ts:budgetedModel` (no caps, no metering). A test never reaches the gateway, so it proves logic, not model behavior.
   - The shopping and study components need registering in a test: `convex/test.setup.ts:registerShopping`, `registerStudy`.
   - Count tests from a clean worktree. In the main checkout, `pnpm test` also picks up the test files in `.claude/worktrees/*`.
4. **What's deployed.** `pnpm exec convex function-spec` lists the functions dev actually runs. `pnpm dev`'s watcher pushes whatever branch its checkout has checked out, so dev can be running another branch while you test yours. `pnpm exec convex dev --once --typecheck disable` pushes once. Don't push to dev while the operator is testing there.
5. **At runtime.**
   - `pnpm exec convex logs --history 200`: recent function runs and their errors.
   - `pnpm exec convex insights`: write conflicts and limits over the last 72 hours. A function that keeps retrying shows up here first. Add `--prod` for production.
   - `pnpm exec convex data <table> --format jsonl`: the rows a change wrote. For a component's tables, name it first: `pnpm exec convex data --component resend emails --format jsonl`.
   - Read-only debug functions: `pnpm exec convex run api/calls:dump` (the latest call) and `pnpm exec convex run api/judgments:summary '{"kind":"check_in"}'` (how Jev's answers spread).
   - `pnpm exec convex env list | cut -d= -f1`. The values are secrets, so print names only.
6. **In the browser.** The `verify-matlida` skill runs the app on an anonymous local backend, so test accounts never reach the cloud. The gateway isn't reachable from an anonymous local deployment. Features that call a model need an authenticated one: unset the exported `CONVEX_DEPLOYMENT` and `VITE_CONVEX_*`, then run `pnpm exec convex dev --configure existing --dev-deployment local`.
7. **Never place calls to test.** Calls play out loud on the operator's machine. Prove call logic with unit tests, and read real calls with `api/calls:dump`.

Production reads take `--prod`. Production writes, deploys and env changes need the operator's OK, every time.

## Components

What `app.use(...)` in `convex/convex.config.ts` installs, and what each one does in Matilda.

| Component                                                       | Package                                      | What it does here                                                                                                                    | Used in                                                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `agent`                                                         | `@convex-dev/agent`                          | Every assistant chat: threads, messages, streamed replies, tool calls and files.                                                     | `convex/models/threads/lead.ts:createAgent`, `convex/models/threads/chat.ts`, and every model that posts to a chat      |
| `workflow`                                                      | `@convex-dev/workflow`                       | Durable steps, each retried on its own: `/run` tasks and in-app call turns.                                                          | `convex/lib/workflow.ts:workflow`, `convex/models/tasks/functions.ts:runPlan`, `convex/models/threads/calls.ts:runTurn` |
| `crons`                                                         | `@convex-dev/crons`                          | Crons registered at runtime, one per recurring reminder, in the owner's time zone. The app's only fixed job is in `convex/crons.ts`. | `convex/models/reminders/functions.ts:register`                                                                         |
| `aiBudget`                                                      | `@convex-dev/ai-budget`                      | Each person's monthly AI cap, and metering on every gateway call.                                                                    | `convex/lib/budget.ts:budget`                                                                                           |
| `rateLimiter`                                                   | `@convex-dev/rate-limiter`                   | Limits on what comes in from outside: inbound email and texts, link-code tries, check-in calls, phone calls, messages to contacts.   | `convex/lib/limits.ts:rateLimiter`                                                                                      |
| `resend`                                                        | `@convex-dev/resend`                         | Sign-in email only: verification and password reset. Assistant email goes through Photon instead.                                    | `convex/models/users/auth.ts`                                                                                           |
| `spectrum`                                                      | `@spectrum-ts/convex`                        | Photon's Spectrum SDK, for texting on iMessage and WhatsApp. Telegram goes through Photon's webhook.                                 | `convex/models/texts/spectrum.ts:spectrum`                                                                              |
| `auth`, `authPassword`, `authEmail`, `authGoogle`, `authGithub` | `@convex-dev/auth` (v2 beta)                 | Sign-in, with HTTP routes under `/auth`, `/oauth/google` and `/oauth/github`. `AUTH_METHODS` picks the methods on each deployment.   | `convex/models/users/auth.ts:authApi`                                                                                   |
| `shopping`                                                      | Matilda's own, `convex/components/shopping/` | Carts, saved checkout details and price watches, in their own tables.                                                                | `convex/models/shopping/functions.ts:shoppingApi`                                                                       |
| `study`                                                         | Matilda's own, `convex/components/study/`    | Decks, cards and spaced-repetition grades.                                                                                           | `convex/models/study/functions.ts:studyApi`, `convex/models/reminders/checkIns.ts`                                      |

Adding a component: install it with pnpm, then `app.use` it in `convex/convex.config.ts`. Wrap it once in `convex/lib/` the way `budget.ts` and `limits.ts` do, then add a row here. A self-contained feature with its own tables can be a component under `convex/components/<name>/`.

## AI gateway

Every model call goes through the Convex AI gateway. Matilda holds no provider keys: the deployment authenticates with its own service token.

- **The client:** `convexGateway` from `@convex-dev/ai-sdk-provider`, set up once per job in `convex/lib/ai.ts`. Fast voice is the exception: it posts straight to the gateway's chat completions endpoint, authenticated with `getServiceToken('ai-gateway')`, in `convex/lib/audio.ts:audioChat`.
- **The model ids:** `convex/lib/models.ts:MODELS`. They're plain strings, so the browser can show them on the Models page (`JOBS`).
- **Metering:** chat models go through `convex/lib/budget.ts:budgetedModel`, and every other call goes through `metered`. A call that would pass the person's cap (`AI_BUDGET_USD`, 12 dollars when unset) is refused. Each call's cost comes from its provider metadata (`convex/models/usage/functions.ts:gatewayCost`), recorded in `usage`. The deployment's overall ceiling is the gateway spend limit in the Convex dashboard.

### Models by job

| Job             | Model id                        | What it's for                                                                                               | Set up in                             |
| --------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `chat`          | `anthropic/claude-sonnet-5`     | Every reply, with all the tools. The default for each assistant and chat.                                   | `convex/lib/ai.ts:languageModel`      |
| `summary`       | `google/gemini-2.5-flash`       | `/tldr` and `quick_summary`.                                                                                | `convex/lib/ai.ts:summaryModel`       |
| `decide`        | `~typesafe/jev-latest`          | Jev, through the gateway's decisions endpoint (alpha): `/decide`, follow-ups, check-ins, hang-ups, grading. | `convex/lib/ai.ts:decisionModel`      |
| `search`        | `perplexity/sonar`              | Web search in replies, and the news briefing.                                                               | `convex/lib/ai.ts:searchModel`        |
| `research`      | `perplexity/sonar-pro`          | `/research` and `/report`.                                                                                  | `convex/lib/ai.ts:researchModel`      |
| `transcription` | `openai/whisper-large-v3-turbo` | What you say on calls, in voice notes and with the mic button.                                              | `convex/lib/ai.ts:transcriptionModel` |
| `speech`        | `hexgrad/kokoro-82m`            | Reading replies out on calls.                                                                               | `convex/lib/ai.ts:speechModel`        |
| `audioChat`     | `openai/gpt-audio-mini`         | Fast voice: hears and answers in one request, with no tools.                                                | `convex/lib/audio.ts:audioChat`       |
| `image`         | `openai/gpt-image-1`            | `/image`.                                                                                                   | `convex/lib/ai.ts:imageModel`         |
| `video`         | `google/veo-3.1-fast`           | `/video`.                                                                                                   | `convex/lib/ai.ts:videoModel`         |

### Chat models in the model menu

`convex/lib/models.ts:CHAT_MODELS` is what the menu offers. Any other id the gateway serves can be typed in (`convex/lib/ai.ts:chatModel`), and `isListedModel` says whether an id is on the menu.

| Model id                     | Name                          |
| ---------------------------- | ----------------------------- |
| `anthropic/claude-sonnet-5`  | Claude Sonnet 5 (the default) |
| `anthropic/claude-opus-5`    | Claude Opus 5                 |
| `anthropic/claude-haiku-4.5` | Claude Haiku 4.5              |
| `openai/gpt-5`               | GPT-5                         |
| `openai/gpt-5-mini`          | GPT-5 mini                    |
| `google/gemini-2.5-pro`      | Gemini 2.5 Pro                |
| `google/gemini-2.5-flash`    | Gemini 2.5 Flash              |
| `deepseek/deepseek-v3.2`     | DeepSeek V3.2                 |
| `x-ai/grok-4.7`              | Grok 4.7                      |
| `meta/muse-spark-1.3`        | Muse Spark 1.3                |

### Changing a model

1. Change the id in `convex/lib/models.ts`, and its row in `JOBS` or `CHAT_MODELS`.
2. Update the tables above and the README's "Models" section.
3. Run `pnpm check` and `pnpm test`. The tests use mocked models, so try the real one on an authenticated local deployment (step 6 above) before calling it done.
