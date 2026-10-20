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

| Name                                                                        | What it's for                                                                      |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `SITE_URL`                                                                  | The app's URL, used in email links and OAuth redirects                             |
| `AUTH_PRIVATE_KEY`, `AUTH_JWKS`                                             | Key pair Convex Auth signs session tokens with                                     |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM`                                         | Sending verification and reset emails                                              |
| `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`                        | Google sign-in                                                                     |
| `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET`                        | GitHub sign-in                                                                     |
| `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `SPECTRUM_WEBHOOK_SECRET` | Messaging on iMessage and WhatsApp through Photon. Optional                        |
| `TELEGRAM_BOT_TOKEN`                                                        | Messaging on Telegram, with the token from @BotFather. Optional                    |
| `MAIL_DOMAIN`                                                               | The domain of the users' assistant email addresses, verified with Resend. Optional |

To message on Telegram, add the bot in Photon, set `TELEGRAM_BOT_TOKEN`, then run `npx convex run api/sender:connectTelegram` once to point the bot at Photon. WhatsApp needs only the number added in Photon.

And in the app's environment when deploying:

| Name            | What it's for                                                    |
| --------------- | ---------------------------------------------------------------- |
| `VITE_SITE_URL` | Public URL, so the `og:image` link is absolute for link previews |

## Scripts

| Command       | Does                              |
| ------------- | --------------------------------- |
| `pnpm dev`    | Convex + Vite dev servers         |
| `pnpm build`  | Type check, then production build |
| `pnpm start`  | Run the production build          |
| `pnpm lint`   | Type check and ESLint             |
| `pnpm format` | Prettier                          |
