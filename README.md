<p align="center">
  <img src="public/logo.svg" alt="" width="96" />
</p>

<h1 align="center">Matilda</h1>

<p align="center">Matilda is the only assistant you need, doesn't f**k around</p>

<p align="center"><a href="https://matilda-is-a-bot.app">matilda-is-a-bot.app</a></p>

## What's here

- Sign in with email and password, Google or GitHub (Convex Auth v2, emails sent through Resend).
- Email verification and password reset.
- A signed-in home page with your profile and a sign-out button.

## Stack

- [TanStack Start](https://tanstack.com/start) for the app (React 19, file routes, SSR).
- [Convex](https://convex.dev) for the backend, with [convex-helpers](https://github.com/get-convex/convex-helpers).
- [shadcn/ui](https://ui.shadcn.com) on Tailwind CSS v4.

## Getting started

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` runs `convex dev` and the Vite dev server together. The first run asks you to log in to Convex and writes `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` to `.env.local`.

### Environment variables

Set these on the Convex deployment (`pnpm exec convex env set NAME value`):

| Name                                                                        | What it's for                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SITE_URL`                                                                  | The app's URL, used in email links and OAuth redirects                                                                                                                                                                                           |
| `AUTH_PRIVATE_KEY`, `AUTH_JWKS`                                             | Key pair Convex Auth signs session tokens with                                                                                                                                                                                                   |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM`                                         | Sending verification and reset emails                                                                                                                                                                                                            |
| `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`                        | Google sign-in                                                                                                                                                                                                                                   |
| `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET`                        | GitHub sign-in                                                                                                                                                                                                                                   |
| `AUTH_METHODS`                                                              | The sign-in methods a deployment offers: a comma list of `email`, `google`, `github`. Unset means all. Production sets `github`. Read at deploy time, so redeploy after changing it. Optional                                                    |
| `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `SPECTRUM_WEBHOOK_SECRET` | Texting on iMessage and WhatsApp through Photon's Spectrum SDK. Optional                                                                                                                                                                         |
| `PHOTON_WEBHOOK_SECRET`                                                     | Signs Photon's events to `/photon/webhook`: Telegram, and email arriving (`whsec_…`). Optional                                                                                                                                                   |
| `PHOTON_PROJECT_ID`, `PHOTON_API_KEY`                                       | Email and Telegram through Photon's platform API (beta). Optional                                                                                                                                                                                |
| `MAIL_DOMAIN`                                                               | The domain users claim `handle@MAIL_DOMAIN` on, connected in Photon. Optional                                                                                                                                                                    |
| `PHOTON_PHONE_NUMBER`, `PHOTON_SIP_USERNAME`, `PHOTON_SIP_PASSWORD`         | Phone calls: the line they ring from and its Voice profile's outbound SIP credential. `PHOTON_SIP_HOST` if the profile shows a server other than `sip.photon.codes`. Optional                                                                    |
| `FLAGS_SECRET`, `FLAGS_URL`                                                 | Feature flags: Convex asks the Worker's `/api/flags`, which reads Cloudflare Flagship through its binding. The secret is shared with the Worker; `FLAGS_URL` only on dev. Phone calls stay off unless Flagship's `no-calls` is off for the user. Optional |

To message on Telegram, connect the bot in Photon's dashboard, point the project's webhook at `/photon/webhook`, and set its signing secret as `PHOTON_WEBHOOK_SECRET`. iMessage and WhatsApp go through the Spectrum SDK and its webhook at `/spectrum/webhook`. The full setup for email and every messaging app is in [docs/setup/channels.md](docs/setup/channels.md).

### Deploying to Cloudflare

The app runs on the `matlida` Cloudflare Worker (`wrangler.jsonc`). Nothing in `.env*` is committed, so give the build its values from the environment:

```bash
VITE_CONVEX_URL=https://knowing-magpie-554.eu-west-1.convex.cloud pnpm run deploy
```

On Workers Builds, set `VITE_CONVEX_URL` (and `VITE_SITE_URL`) under the Worker's build environment variables instead.

And in the app's environment when deploying:

| Name            | What it's for                                                    |
| --------------- | ---------------------------------------------------------------- |
| `VITE_SITE_URL` | Public URL, so the `og:image` link is absolute for link previews |

### Models

Every assistant runs on `anthropic/claude-sonnet-5` through the Convex AI gateway unless you pick another in its form, and any chat can switch models from the menu in its header without losing its history. The list is in `convex/lib/models.ts`; any id from the gateway catalog can be typed in.

## Commands in the chat

Type `/` in the message box to pick one, or ask an assistant "what can you do?" to get them as buttons. Write what it's about after the name, like `/quiz the French Revolution`. Commands you save in the Library work the same way, and one with the same name replaces the built-in.

| Group                      | Commands                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Make things                | `/create` (say what you want made, and it works out how), `/image`, `/video`, `/chart`, `/doc`, `/email`, `/posts`, `/preview`                                            |
| Pages that stay up to date | `/report`, `/memo`, `/dashboard`                                                                                                                                          |
| Plan and do                | `/plan` (save a plan), `/run` (plan it and work through it step by step), `/today`, `/dayplan`, `/trip`, `/todo`, `/focus`, `/workout`                                    |
| Decide and solve           | `/decide` (Jev picks between options), `/make-my-problems-go-away` (can AI do this, or should a person?), `/fix`, `/convex`, `/compare`, `/research`, `/explain`, `/tldr` |
| Learn                      | `/study` (flash cards), `/quiz` (test yourself)                                                                                                                           |
| Shopping                   | `/shop`, `/gift`, `/watch` (hear when a price drops), `/cart`, `/shopping` (list by aisle), `/meals`, `/recipe`                                                           |
| Everyday                   | `/news`, `/split` (who owes whom), `/meet` (a time across time zones), `/convert`, `/pack`, `/setup` (connect email, Telegram, texts and calls)                           |
| Words                      | `/rewrite`, `/reply`, `/translate`                                                                                                                                        |

The full list, with what each one does, is in `convex/lib/commands.ts`. A test checks that this table names every built-in command.

## Scripts and commands

| Command                                                            | Does                                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                         | Convex and Vite dev servers, on port 3000                                                                   |
| `pnpm check`                                                       | Type check, ESLint and a production build. Run it before every push                                         |
| `pnpm test`                                                        | The Vitest suite (`convex/tests`, `src/tests`)                                                              |
| `pnpm build`                                                       | Type check, then a production build                                                                         |
| `pnpm preview`                                                     | Serve the production build locally, in Cloudflare's runtime                                                 |
| `pnpm run deploy`                                                  | Build, then deploy the `matlida` Worker to Cloudflare (`pnpm deploy` is a different, built-in pnpm command) |
| `pnpm lint`                                                        | Type check and ESLint                                                                                       |
| `pnpm format`                                                      | oxfmt                                                                                                       |
| `scripts/pr-size.sh origin/master`                                 | Lines a PR changes, against the 2000 limit                                                                  |
| `pnpm exec convex dev --once --typecheck disable`                  | Push functions and schema to the dev deployment once                                                        |
| `pnpm exec convex insights`                                        | Write conflicts and limits over the last 72 hours (`--prod` for production)                                 |
| `pnpm exec convex logs --history 200`                              | Recent function runs                                                                                        |
| `pnpm exec convex env list \| cut -d= -f1`                         | Environment variable names only, since values are secrets                                                   |
| `pnpm exec convex run api/judgments:summary '{"kind":"check_in"}'` | How Jev's answers spread, before moving a threshold (`recurring`, `after_missed_call`, `answer`)            |
| `pnpm exec convex run api/calls:dump`                              | The latest call's transcript and timings                                                                    |

## What's next

Matilda is heading four ways. **The rule:** pick the next piece of work from this list, in this order:

1. Whatever is broken or blocking.
2. The feedback loop, because it makes everything else measurable.
3. The rest, by what you'd use this week.

Each piece is one PR on master, merged before the next starts. When it ships, move it from here into progress.md, and add what it made possible.

### Workflows with AI and Convex

Long jobs that run as durable steps, wait for you, and pick up where they stopped.

- **Today:** `/run` works through a plan on `@convex-dev/workflow`, with Start, Cancel and Try again from the failed step. Reminders recur on `@convex-dev/crons`, and Jev pauses or stops them.
- **Next:**
  - Workflows with an approval step, like drafting posts, waiting for your OK, posting, then reporting links.
  - Commands that start a workflow instead of a reply.
  - Each step choosing its own model and effort.

### Looped projects that report and guide

Projects that check themselves on a schedule and tell you where they stand.

- **Today:** pages from `/report` and `/dashboard` refresh themselves daily or weekly. The news arrives daily. Matilda calls to check in when Jev thinks something is owed.
- **Next:** a project loop, a recurring task that reviews a project's plans, tasks and pages. Each run:
  - writes a weekly report page;
  - says what's slipping and what to do next;
  - stops or pauses itself the way recurring reminders do.

### Custom frontend features

Show what you want, the way you want it.

- **Today:** replies render as cards: charts, tables, timelines, recipes, carts, decks and quizzes, pages with metrics, tasks, reminders.
- **Next:**
  - Cards you can pin to a project's home.
  - A layout you choose for each project.
  - New card types described in a command, rendered from a small set of building blocks rather than new code each time.

### Feedback loop

Learn from what happened, then change what happens next.

- **Today:** every Jev answer and what code did with it is kept in `judgments`. Costs are tracked per chat and per person, and `convex insights` shows conflicts.
- **Next:**
  - Thumbs up or down on replies and cards, kept with the reply.
  - A weekly look at the judgments summary that moves `JEV_THRESHOLDS` where the outcomes say they're wrong.
  - What you corrected goes back into each assistant's instructions.
