# Integrations

The goal, rules and setup for each external service. Status shows what's live. The build order is in `tasks.md`.

| Setup | Status |
|---|---|
| [Auth](#auth) | live (username + password) |
| [AI models (BYOK)](#ai-models-byok) | live, waiting on a real key to test the happy path |
| [Email](#email) | planned |
| [Texting (Photon)](#texting-photon) | planned |
| [Calls (Cloudflare RealtimeKit)](#calls-cloudflare-realtimekit) | planned |

## Auth

**Goal:** every project, connection, call and secret belongs to a signed-in user, and nothing is public.

**Rules**
- Use Convex Auth v2 (`@convex-dev/auth@2.0.0-alpha.2`, pinned because it's alpha). The core, password and username components are mounted in `convex/convex.config.ts`, and `convex/auth.ts` exports the sign-in functions. Sign-in uses a username and password for now, and switches to email + password with verification once platform email exists.
- **Setup:** `npx @convex-dev/auth` puts `AUTH_PRIVATE_KEY` and `AUTH_JWKS` on the deployment. `convex/auth.config.ts` trusts the JWTs from `<site>/auth/.well-known/jwks.json`.
- **The app is gated on the client:** `<Unauthenticated>` shows `AuthScreen`, and `<Authenticated>` shows the app.
- Public functions use the `authed*` builders in `convex/lib/functions.ts`, which inject `ctx.user`. Never take a user id as an argument.
- Check access through the owning project (`getOwnedProject`). If the user doesn't own it, the record doesn't exist as far as they're concerned.
- **Fallback:** Convex Auth v1 (`0.0.96`) if v2 blocks us. Switching only touches `lib/functions.ts` and `src/router.tsx`.

## AI models (BYOK)

**Goal:** each project runs on the model its owner picks: the Convex AI Gateway by default, the owner's own API key, or their OpenRouter account.

**Rules**
- **Keys:**
  - Keys are encrypted at rest with AES-256-GCM (`convex/lib/crypto.ts`, env `SECRETS_KEY`).
  - They're decrypted only inside actions and never returned to the client. The UI shows the last 4 characters.
  - Every key is checked with one cheap API call when it's saved.
- **Bad keys:** an invalid key marks the connection `invalid` and shows the error in the thread. We never silently fall back to the gateway, because the team would pay for it.
- **"Your own subscription"** means OpenRouter OAuth (PKCE). Claude Pro/Max and ChatGPT plans can't power third-party apps, so we don't offer them.
- **Providers:** `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` and `@openrouter/ai-sdk-provider`, all running in the default Convex runtime. A pnpm override in `pnpm-workspace.yaml` pins `@ai-sdk/provider`, so every model shares one type.
- **Where it lives:**
  - `convex/models/aiConnections/` holds the table, the functions and the provider list shared with the UI.
  - `convex/lib/crypto.ts` does the encryption.
  - `convex/lib/ai.ts` holds `resolveModel`, `checkApiKey` and `isKeyRejected`.
  - In the UI: `/settings`, `/settings/openrouter`, and the AI picker on the project form.
- **Env:** `SECRETS_KEY` (base64, 32 bytes), declared in `convex/convex.config.ts`.

## Email

**Goal:** the lead drafts emails and sends them through the owner's chosen connector after the owner approves. Replies come back into the same chat.

**Rules**
- v1 sends only. Bots don't read mailboxes; Gmail read scopes need a yearly paid security audit.
- **Every send waits for approval** in the chat, through the agent's tool approvals.
- **Platform email** (auth emails, notifications) goes through `@convex-dev/resend`.
- **User connectors:**
  - Resend, Postmark, Mailgun and Cloudflare are called with `fetch` from the default runtime.
  - Your own SMTP server goes through nodemailer, only in a `"use node"` file. Port 465 uses TLS; port 587 uses STARTTLS. Set explicit timeouts.
  - Gmail (`gmail.send`) and Outlook (`Mail.Send`) use OAuth, with encrypted refresh tokens.
- **Inbound:** Resend inbound posts to `/email/inbound`. The reply-to address `reply+<threadId>@…` routes each reply to its chat.

## Texting (Photon)

**Goal:** you text the project lead from your phone over iMessage, RCS or SMS, and it answers in the same conversation.

**Rules**
- Use `@spectrum-ts/convex`. Inbound messages arrive by webhook into Convex, with no long-running process.
- Conversations start from your side. A phone number is linked to an account only after you confirm a texted code.
- Replies are plain text. Artifacts are sent as a title and a link.
- Respect Photon's limits: 5 requests per second per project, and the plan's daily caps.
- Test on the cloud dev deployment; the local backend ignores `externalPackages`.
- `convex/_workaround.ts` (`"use node"`) must re-export the gRPC peers, or sends fail with a misleading error.

## Calls (Cloudflare RealtimeKit)

**Goal:** calls in which people and the project's AI lead talk, with screen share, chat, recording and a live transcript. When the call ends, the lead writes the notes as an artifact.

**Rules**
- **Server-side:**
  - Participant tokens are minted on the server (a Convex action calling the RealtimeKit REST API) for each join. They're never stored.
  - Webhooks are signature-checked (`rtk-signature`).
- **Client-side:**
  - Call routes render on the client only (`ssr: false`).
  - Meetings start from a click handler, never in an effect.
- **The AI's voice:**
  - The AI hears through RealtimeKit's live transcript, thinks with the same lead and team (the agent component), and speaks through Convex AI Gateway text-to-speech.
  - Its audio plays through a second participant hosted in a person's browser (`enableAudio(customTrack)`), so the AI only joins calls a person is in.
- **Expect 2 to 4 seconds before the AI answers.** The gateway's voice API is alpha.
