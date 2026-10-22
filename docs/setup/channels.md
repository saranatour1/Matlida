# Setting up the channels

How to connect email, iMessage/SMS, Telegram and WhatsApp to a Matilda
deployment, and why phone calls wait. Every secret is set on the Convex
deployment and only named here. Check which deployment a command targets
first: an exported `CONVEX_DEPLOYMENT` overrides `.env.local`. To set a secret
without it landing in your shell history, copy it and run
`pbpaste | pnpm exec convex env set NAME`.

`<deployment>` below is the host of your `.convex.site` URL.

## Env vars, names only

| Name                         | What it's for                                                      |
| ---------------------------- | ------------------------------------------------------------------ |
| `MAIL_DOMAIN`                | The domain connected in Photon. Users claim `handle@` on it.       |
| `PHOTON_PROJECT_ID`          | The Photon project, `pho_prj_…`. Just the id, no `NAME=` in it.    |
| `PHOTON_API_KEY`             | A project API key, `pho_sk_…`. Reads and sends email and Telegram. |
| `PHOTON_WEBHOOK_SECRET`      | Signs Photon's events to `/photon/webhook` (`whsec_…`).            |
| `SPECTRUM_PROJECT_ID`        | Texting: the project id the Spectrum SDK uses.                     |
| `SPECTRUM_PROJECT_SECRET`    | Texting: the project's secret. Not the id.                         |
| `SPECTRUM_WEBHOOK_SECRET`    | Texting: signs the webhook at `/spectrum/webhook`.                 |
| `ELEVENLABS_API_KEY`         | Phone calls: the ElevenLabs API key that places them.              |
| `ELEVENLABS_AGENT_ID`        | Phone calls: the ElevenLabs agent that talks.                      |
| `ELEVENLABS_PHONE_NUMBER_ID` | Phone calls: the Photon number's id in ElevenLabs.                 |

`SITE_URL` and the `AUTH_*` variables are in the README.

## Email

The assistants' email goes through Photon's Email channel (its beta platform,
app.beta.photon.codes). Photon sends, receives and publishes the DNS
records; the app checks Photon for new mail every minute.

1. **Connect a domain.** In the Photon beta dashboard, open the project, then
   Email, and connect a domain or an unused subdomain. Don't use a domain
   whose mail already goes somewhere: its receiving MX record moves to Photon.
2. **Publish the DNS records** Photon shows for it: the DKIM CNAMEs, the bounce
   MX and SPF TXT, and the receiving MX. On Cloudflare, set the CNAMEs to
   DNS only. Photon checks them by itself; wait until the domain says
   Connected.
3. **Create an API key** under API keys with `project:read` and
   `project:write`, and copy the project id from Settings.
4. **Set** `MAIL_DOMAIN`, `PHOTON_PROJECT_ID` and `PHOTON_API_KEY` on the
   deployment. Connections' Email row says what's still missing.
5. **Claim an address** on Connections. Claiming needs a verified sign-in
   email: it's the only address the assistants accept mail from as you, and
   the only one they write to.
6. **Try it.** Email your address. Within a minute it shows in Matilda's
   chat with a draft reply under it. Press Reply, edit the draft, and Send
   mails it in the same thread, to the sender only.

Photon doesn't pass on DKIM or DMARC results, so a forged From can't be told
from yours. Nothing is sent until you press Send, drafts only get tools that
read, and drafts are capped at 5 at once, then 20 an hour.

## Telegram

1. Connect your Telegram bot to the project in the Photon beta dashboard
   (create it with @BotFather and give Photon its token). The app never sees
   the token.
2. Point the project's webhook at
   `https://<deployment>.convex.site/photon/webhook`, and set its signing
   secret (`whsec_…`) as `PHOTON_WEBHOOK_SECRET`. `PHOTON_PROJECT_ID` and
   `PHOTON_API_KEY` are the same as for email.
3. In the app, get a code on Messaging and send `link <code>` to the bot.
   Then message it. Everything goes to Matilda.

Replies go out through Photon's API. Photon hasn't delivered events to the
webhook yet, so the app also checks Photon for new Telegram messages every
minute, and every 3 seconds for 2 minutes after any message: the first reply
after a quiet spell can take up to a minute.

## Texting: iMessage and SMS

1. Copy the project's id and secret into `SPECTRUM_PROJECT_ID` and
   `SPECTRUM_PROJECT_SECRET`. They're different values: a secret that equals
   the id means it was pasted into the wrong field.
2. Register a Spectrum webhook pointing at
   `https://<deployment>.convex.site/spectrum/webhook`, and copy its signing
   secret into `SPECTRUM_WEBHOOK_SECRET`. The route refuses deliveries without
   it, or with a bad or stale signature. It reads the Spectrum SDK's format:
   a webhook destination made on Photon's beta platform sends a different
   format, and the route rejects it.
3. Photon provisions the iMessage line. When a recipient isn't on iMessage,
   the line falls back to SMS or RCS by itself.
4. In the app, open Messaging, get a code, and text `link <code>` to the line.
   Then message it. Everything goes to Matilda.

## WhatsApp

1. Add a WhatsApp Business number to the Photon project. Photon holds the
   Meta credentials, so the texting keys are enough.
2. In the app, get a code on Messaging and send `link <code>` to the number.

WhatsApp allows free-form replies only within 24 hours of your last message.

## Phone calls

Ask an assistant in the chat to call a number you type ("call +14155550123
and tell her dinner is at 8"). It rings from your Photon number. Photon only
carries the call over SIP, so an ElevenLabs agent does the talking: Convex
asks ElevenLabs to place the call (`convex/lib/phone.ts`), and ElevenLabs
dials out through Photon.

1. In Photon, follow [Set up Photon with ElevenLabs](https://photon.codes/docs/beta/cookbooks/voice/elevenlabs):
   a SIP Voice profile for your number with outbound enabled (SHA-256), and
   the number imported into ElevenLabs under Phone Numbers → Import number →
   From SIP Trunk, with Photon's outbound username and password.
2. In ElevenLabs, create an agent. Under its Security settings, allow
   overrides for **First message** and **System prompt**: each call sends
   its own opening line and what the call is about.
3. Set `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` and
   `ELEVENLABS_PHONE_NUMBER_ID` (the imported number's id) on the deployment.
   Connections then shows Phone calls as connected.

Limits: an assistant only dials a number that's in your last message, never
one from an email or a page, and at most 10 calls a day per person. The call
itself isn't in the app's call history yet: ElevenLabs keeps the
conversation.
