# Setting up the channels

How to connect email and Telegram to a Matilda deployment, and why phone calls wait. Every secret is set on the Convex
deployment and only named here. Check which deployment a command targets
first: an exported `CONVEX_DEPLOYMENT` overrides `.env.local`. To set a secret
without it landing in your shell history, copy it and run
`pbpaste | pnpm exec convex env set NAME`.

`<deployment>` below is the host of your `.convex.site` URL.

## Env vars, names only

| Name                    | What it's for                                                      |
| ----------------------- | ------------------------------------------------------------------ |
| `MAIL_DOMAIN`           | The domain connected in Photon. Users claim `handle@` on it.       |
| `PHOTON_PROJECT_ID`     | The Photon project, `pho_prj_…`. Just the id, no `NAME=` in it.    |
| `PHOTON_API_KEY`        | A project API key, `pho_sk_…`. Reads and sends email and Telegram. |
| `PHOTON_WEBHOOK_SECRET` | Signs Photon's events to `/photon/webhook` (`whsec_…`).            |

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

## Phone calls: why not yet

Connections lists phone calls as coming soon. Photon's voice routes a phone
call over SIP to a voice agent, and its beta platform sends call events
(`call.started`, `call.ended` and the rest) to a webhook. The audio still
needs an always-on process that speaks SIP and streams audio both ways for
the length of the call, which a Convex function can't be. A call would take
a small voice server that answers Photon's SIP line, runs each turn through
the same pipeline as in-app calls, and reports the call to the app for the
call history. In-app calls, and reminders that ring you in the app, work
today.
