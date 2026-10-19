<p align="center">
  <img src="public/logo.svg" alt="" width="96" />
</p>

<h1 align="center">Matilda</h1>

<p align="center">Matilda is the only assistant you need, doesn't f**k around</p>

## What's here

- Sign in with email and password, Google or GitHub (Convex Auth v2, emails sent through Resend).
- Email verification and password reset.
- A signed-in home page with your profile and a sign-out button.

## Stack

- [TanStack Start](https://tanstack.com/start) for the app (React 19, file routes, SSR).
- [Convex](https://convex.dev) for the backend, with [convex-helpers](https://github.com/get-convex/convex-helpers).
- [shadcn/ui](https://ui.shadcn.com) on Tailwind CSS v4.
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) for hosting, through `@cloudflare/vite-plugin` and `wrangler.jsonc`.

## Getting started

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` runs `convex dev` and the Vite dev server together. The first run asks you to log in to Convex and writes `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` to `.env.local`.

### Environment variables

Set these on the Convex deployment (`npx convex env set NAME value`):

| Name                                                                        | What it's for                                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `SITE_URL`                                                                  | The app's URL, used in email links and OAuth redirects          |
| `AUTH_PRIVATE_KEY`, `AUTH_JWKS`                                             | Key pair Convex Auth signs session tokens with                  |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM`                                         | Sending verification and reset emails                           |
| `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`                        | Google sign-in                                                  |
| `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET`                        | GitHub sign-in                                                  |
| `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `SPECTRUM_WEBHOOK_SECRET` | Messaging on iMessage and WhatsApp through Photon. Optional     |
| `TELEGRAM_BOT_TOKEN`                                                        | Messaging on Telegram, with the token from @BotFather. Optional |

To message on Telegram, add the bot in Photon, set `TELEGRAM_BOT_TOKEN`, then run `npx convex run api/sender:connectTelegram` once to point the bot at Photon. WhatsApp needs only the number added in Photon.

## Deploy

Cloudflare Workers Builds deploys the `matlida` Worker from GitHub. A push to `master` deploys Convex to production, then the site. Other branches build against the dev deployment and update their branch's Preview. They leave Convex alone.

Set these on the Worker, under Settings → Build:

- Branch control, production branch: `master`.
- Build command:
  ```bash
  if [ "$WORKERS_CI_BRANCH" = "master" ]; then WORKERS_CI_BRANCH=main pnpm exec convex deploy --yes --cmd "pnpm build" --cmd-url-env-var-name VITE_CONVEX_URL; else VITE_CONVEX_URL=https://strong-bear-866.eu-west-1.convex.cloud pnpm build; fi
  ```
  `WORKERS_CI_BRANCH=main` is there because on Cloudflare the Convex CLI treats only a branch named `main` as production.
- Deploy command: `pnpm exec wrangler deploy`.
- Preview command: `pnpm exec wrangler preview`.
- Build variables and secrets. These are build-time values, not the Worker's runtime variables, which the build can't see:

  | Name                | Value                                                                       |
  | ------------------- | --------------------------------------------------------------------------- |
  | `CONVEX_DEPLOY_KEY` | A production deploy key from the Convex dashboard. Make it a secret.        |
  | `PNPM_VERSION`      | `12.6.0`                                                                    |
  | `VITE_SITE_URL`     | The site's public URL, so the `og:image` link is absolute for link previews |

The Worker itself needs no runtime variables. Every secret lives on Convex. Before the first `master` build, set the Convex variables from [Environment variables](#environment-variables) on the production deployment (`pnpm exec convex env set NAME value --prod`), with `SITE_URL` set to the site's public URL. Point the Google and GitHub OAuth apps at the production deployment too.

Previews use the dev deployment, whose `SITE_URL` is `http://localhost:3000`. Password sign-in works on them, but email links and Google or GitHub sign-in return to localhost.

## Scripts

| Command        | Does                                                    |
| -------------- | ------------------------------------------------------- |
| `pnpm dev`     | Convex + Vite dev servers                               |
| `pnpm build`   | Type check, then production build into `dist/`          |
| `pnpm preview` | Serve the production build in the local Workers runtime |
| `pnpm lint`    | Type check and ESLint                                   |
| `pnpm format`  | Prettier                                                |
