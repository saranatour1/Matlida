# Tasks

## Done

- [x] Convex Auth v2: email + password (Resend emails), Google and GitHub, with email verification and password reset
- [x] Auth pages styled after shadcn's signup-05 block
- [x] Kite logo (`public/logo.svg`), favicons, apple-touch and Android icons, OG image (`public/og.png`)
- [x] Logo v2: kite as a chat bubble with typing dots, designed in Paper ("Matilda — Logo")
- [x] Head SEO: description, Open Graph and Twitter card tags, web manifest name
- [x] README with Matilda's bio, stack, setup and env vars

## Open

- [ ] Phone calls for reminders, once Photon ships SDK call control

- [x] Assistants sidebar: Matilda first, then bots, each with its chats
- [x] Orb avatars, settings, library and thread members
- [x] Web search and research, plans, voice input
- [x] Right panel: environment, context, connectors, changes, costs
- [x] Reminders that post in the chat and text you
- [x] New assistant dialog, copies, template links, group chats from search
- [x] Portraits: 22 ready-made assistant portraits in the minimal bot-icon style
- [x] In-app voice calls with any assistant
- [x] Assistants ring you in the app for call reminders
- [x] Message assistants over iMessage, WhatsApp and Telegram through Photon
- [ ] Try messaging live once Photon, Telegram and WhatsApp credentials are set
- [ ] WhatsApp templates for reminders outside the 24-hour window
- [ ] Calls: barge-in, and streaming speech per sentence for lower latency

- [ ] Drop the `@opentelemetry/core` override once `@photon-ai/otel` updates its exporters
- [x] Build for Cloudflare Workers (`wrangler.jsonc`, Cloudflare Vite plugin)
- [ ] Set the Workers Builds settings and build variables from the README (production branch `master`, build command, `CONVEX_DEPLOY_KEY`, `PNPM_VERSION`, `VITE_SITE_URL`)
- [ ] Set the production Convex env and OAuth callbacks before the first `master` deploy
