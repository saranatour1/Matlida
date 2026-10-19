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
- [x] Call history, and the call docked at the side with its full transcript
- [x] Assistants ring you in the app for call reminders
- [x] Details panel is full screen on phones
- [x] Message assistants over iMessage, WhatsApp and Telegram through Photon
- [x] Connections page: one registry of every channel and its status
- [x] Email: a personal address per user, claimed on Connections
- [x] Email: inbound mail answered by an assistant, with sender authentication
- [ ] Email reminders
- [ ] Setup guide for email, Photon, Telegram and WhatsApp, with a DNS checker
- [ ] Try messaging live once Photon, Telegram and WhatsApp credentials are set
- [ ] WhatsApp templates for reminders outside the 24-hour window
- [x] Calls: pause when you talk over the assistant, and wait longer before taking the turn
- [x] Calls: speak the reply sentence by sentence as it streams
- [ ] Calls: keep listening in a background tab (the mic check runs on animation frames)
- [ ] Tune the turn-taking thresholds from real calls (`npx convex run api/calls:dump`)

- [ ] Drop the `@opentelemetry/core` override once `@photon-ai/otel` updates its exporters
- [ ] Set `VITE_SITE_URL` on the deployed app so `og:image` is an absolute URL
