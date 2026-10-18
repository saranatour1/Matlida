# Integrations

The goal, rules and setup for each external service. Status shows what's live. The build order is in `tasks.md`.

| Setup | Status |
|---|---|
| [Auth](#auth) | live (username + password) |
| [AI models](#ai-models) | live (Convex AI Gateway) |
| [Email](#email) | live for API providers and SMTP; Gmail, Outlook, platform email and inbound wait on accounts |
| [Texting (Photon)](#texting-photon) | planned |
| [Calls (Cloudflare RealtimeKit)](#calls-cloudflare-realtimekit) | planned |

## Auth

**Goal:** every project, connection, call and secret belongs to a signed-in user, and nothing is public.

**Rules**
- Use Convex Auth v2 (`@convex-dev/auth@2.0.0-beta.0`, pinned because it's a beta). The core, password and username components are mounted in `convex/convex.config.ts`, and `convex/auth.ts` exports the sign-in functions. Sign-in uses a username and password for now, and switches to email + password with verification once platform email exists.
- **Setup:** `npx @convex-dev/auth` puts `AUTH_PRIVATE_KEY` and `AUTH_JWKS` on the deployment. `convex/auth.config.ts` trusts the JWTs from `<site>/auth/.well-known/jwks.json`.
- **The app is gated on the client:** `<Unauthenticated>` shows `AuthScreen`, and `<Authenticated>` shows the app.
- Public functions use the `authed*` builders in `convex/lib/functions.ts`, which inject `ctx.user`. Never take a user id as an argument.
- Check access through the owning project (`getOwnedProject`). If the user doesn't own it, the record doesn't exist as far as they're concerned.
- **Fallback:** Convex Auth v1 (`0.0.96`) if v2 blocks us. Switching only touches `lib/functions.ts` and `src/router.tsx`.

## AI models

**Goal:** every lead and employee runs on the Convex AI Gateway, billed to the team.

**Rules**
- One model for now: `anthropic/claude-sonnet-4.5`, set in `convex/lib/ai.ts` as `languageModel`.
- No user keys (BYOK). The gateway can't take a user's key, so supporting it means a second model path. It was built and removed to keep v1 small; it's in git history (commit `7059af9`).

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
- **Inbound:** Resend inbound posts to `/email/inbound`. The reply-to address `reply+<threadId>@…` routes each reply to its chat. Not built yet: it needs a Resend domain with inbound.
- **Where it lives:**
  - `convex/models/emailConnections/` holds the table (`config` is a union by kind), `api.ts` (the `fetch` senders and credential checks) and `smtp.ts` (`"use node"`, nodemailer). `convex/smtp.ts` is its API file.
  - The lead's `send_email` tool has `needsApproval: true`. `chat.decide` saves the answer and resumes the lead.
  - `EmailPart` renders the approval card.
- **Known workaround:** `keepCurrentApprovals` in `lead.ts` works around an @convex-dev/agent 0.7.7 bug, where a thread with an older approval rejects new ones. Remove it once the agent is fixed.

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
