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
- [x] Email: mail to your address shows in the app, and Matilda answers yours
- [x] Email: reminders by email, and a limit on answered emails
- [x] Contacts, and messages to them by email after you confirm
- [x] Tasks on Convex workflows: run a saved plan step by step with a live card
- [x] Built-in commands, a "+" menu, and commands written by AI
- [x] Charts and post previews in the chat (/chart, /preview)
- [x] A TipTap markdown editor for instructions, with ready-made rules and notes
- [x] Setup guide for email, Photon, Telegram and WhatsApp
- [x] Several models: per bot, per lead and per chat, with the chat's history kept
- [x] Effort levels per bot, per lead and per chat, and one createAgent for every assistant
- [x] One chat per assistant, and no bot members unless you add them
- [x] Email and texts go only to the lead; Reply to any email with an editable draft
- [x] find_emails and find_texts: the lead searches your earlier email and texts
- [x] Telegram is the only texting app: iMessage, WhatsApp and the Spectrum SDK removed
- [x] decide tool and /decide command: Jev picks between options
- [x] Everyday commands, part 1: live lists, drafts, tables and recipes, with /todo, /shopping, /meals, /recipe, /pack, /rewrite, /reply, /translate, /tldr, /compare, /workout, /explain
- [x] Everyday commands, part 2: /today, /dayplan, /trip, /split, /meet, /focus, /convert
- [x] Shopping: find products across Shopify stores, a cart by store, Buy at the store's checkout with your details (/shop, /gift, /cart)
- [ ] Shopping: our own UCP profile and a Shopify token for production rate limits
- [ ] Shopping: pay on your behalf (Shopify trusted agent, or Stripe Link in the US and Canada)
- [x] Price watches: /watch an item and hear when it drops
- [x] Previews in sets with a Discord look
- [x] /news: set up what you follow, a briefing card, and an optional daily briefing
- [x] Pages: reports, memos and dashboards you edit together, kept up to date (/report, /memo, /dashboard)
- [x] Roles: ARIA roles and labels on every chat card
- [x] A volume bar on calls
- [x] Models as an object map
- [x] Audio chat: talk hands-free in the chat with a speaking animation, and Fast voice on calls
- [x] A mute toggle on the volume bar
- [x] Pictures: /image makes one with GPT Image 1, saved in Convex storage
- [ ] Videos: /video with Veo 3.1 in the background, saved in Convex storage
- [ ] Try messaging live once Photon, Telegram and WhatsApp credentials are set
- [ ] WhatsApp templates for reminders outside the 24-hour window
- [x] Calls: pause when you talk over the assistant, and wait longer before taking the turn
- [x] Calls: speak the reply sentence by sentence as it streams
- [ ] Calls: keep listening in a background tab (the mic check runs on animation frames)
- [ ] Tune the turn-taking thresholds from real calls (`npx convex run api/calls:dump`)

- [ ] Drop the `@opentelemetry/core` override once `@photon-ai/otel` updates its exporters
- [ ] Set `VITE_SITE_URL` on the deployed app so `og:image` is an absolute URL
