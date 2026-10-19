# Setting up the channels

How to connect email, iMessage/SMS, Telegram and WhatsApp to a Matilda
deployment, and why phone calls wait. Every secret below is set on the
Convex deployment with `pnpm exec convex env set NAME value`; this guide only
ever names them. Check which deployment a command targets first: an exported
`CONVEX_DEPLOYMENT` overrides `.env.local`.

Replace `mail.example.com` with your mail domain, `<deployment>` with your
Convex deployment's name (the host of your `.convex.site` URL), and
`us-east-1` with the region you pick in Resend.

## Env vars, names only

| Name                      | Set by                                                            |
| ------------------------- | ----------------------------------------------------------------- |
| `RESEND_API_KEY`          | Already set for auth email. Also sends and reads assistant email. |
| `MAIL_DOMAIN`             | Step 2. The domain users claim `handle@MAIL_DOMAIN` on.           |
| `RESEND_WEBHOOK_SECRET`   | Step 7. Signs Resend's `email.received` webhook.                  |
| `SPECTRUM_PROJECT_ID`     | Step 9. From the Photon dashboard.                                |
| `SPECTRUM_PROJECT_SECRET` | Step 9. From the Photon dashboard.                                |
| `SPECTRUM_WEBHOOK_SECRET` | Step 9. Signs Photon's webhook.                                   |
| `TELEGRAM_BOT_TOKEN`      | Step 10. From @BotFather.                                         |

`SITE_URL`, `AUTH_*` and `AUTH_EMAIL_FROM` are unchanged and documented in
the README.

## 1. A domain

Pick a subdomain for assistant mail, like `mail.example.com`, even if you
own the root. Resend only receives mail where its MX record has the lowest
priority, so a subdomain keeps your existing inbox at `example.com` working,
and keeps the assistants' sending reputation apart from yours.

## 2. Verify the domain with Resend for sending

1. In Resend, open Domains, add `mail.example.com` and pick a region.
2. Add the records Resend shows. They are:

   | Record   | Name                | Type  | Value                                      |
   | -------- | ------------------- | ----- | ------------------------------------------ |
   | DKIM     | `resend._domainkey` | TXT   | `p=MIG…` (the key Resend shows)            |
   | SPF      | `send`              | MX    | `10 feedback-smtp.us-east-1.amazonses.com` |
   | SPF      | `send`              | TXT   | `v=spf1 include:amazonses.com ~all`        |
   | Tracking | `links`             | CNAME | optional; the assistants send plain text   |

   Names are relative to `mail.example.com`. `send` is Resend's default
   return-path subdomain; if you set a custom one, pass it to the checker as
   `--return-path=<label>`.

3. Wait for Resend to show the domain as verified.
4. Set `MAIL_DOMAIN` to `mail.example.com` on the Convex deployment.

## 3. DMARC, strict

Add one TXT record at `_dmarc.mail.example.com`:

```
v=DMARC1; p=reject; adkim=s; aspf=s; rua=mailto:dmarc@example.com; fo=1
```

- `p=reject`: mail that fails DMARC is refused by receivers. The app refuses
  it too (an email is answered only when Resend saw DMARC pass with an
  aligned DKIM signature), so this is belt and braces.
- `adkim=s`: Resend signs with `d=mail.example.com`, which aligns strictly.
- `aspf=s`: Resend's return path is `send.mail.example.com`, a subdomain,
  which does not align strictly. That's fine: DMARC passes when either DKIM
  or SPF aligns, and DKIM does. Keep `aspf=s` so a forged return path on
  your exact domain can't pass on SPF alone.
- `rua=`: a mailbox you read. If it's on another domain than
  `mail.example.com`, that domain must also publish
  `mail.example.com._report._dmarc.<that domain>` TXT `v=DMARC1` to accept
  the reports.

Resend's own guidance is to start at `p=none` and tighten once reports look
clean. Since this domain sends only the assistants' mail through Resend, you
can start at `p=reject`; the checker tells you if it isn't.

## 4. Receiving: the MX record

1. In Resend, open the domain and turn on receiving.
2. Add the MX record it shows at `mail.example.com`:

   ```
   10 inbound-smtp.us-east-1.amazonaws.com
   ```

   It must be the lowest priority MX on the domain (ideally the only one).

3. Click "I've added the record" and wait for it to verify.

## 5. Optional: MTA-STS and TLS-RPT

These ask senders to use TLS to your domain and to report when they can't.

- TXT at `_mta-sts.mail.example.com`: `v=STSv1; id=20261020`
- A policy served at `https://mta-sts.mail.example.com/.well-known/mta-sts.txt`:

  ```
  version: STSv1
  mode: testing
  mx: inbound-smtp.us-east-1.amazonaws.com
  max_age: 604800
  ```

  Move `mode` to `enforce` once reports are clean, and bump `id` whenever
  the policy changes.

- TXT at `_smtp._tls.mail.example.com`: `v=TLSRPTv1; rua=mailto:tls@example.com`

The app doesn't depend on either.

## 6. Check the records

```
node scripts/check-email-dns.mjs mail.example.com
```

It reads public DNS over HTTPS and prints a PASS, FAIL or INFO line for the
receiving MX, SPF, DKIM, each DMARC setting, and the optional records. It
needs no credentials. Use `--resolver=google` to ask Google's resolver
instead of Cloudflare's.

## 7. The Resend webhook

1. In Resend, open Webhooks and add one with the URL
   `https://<deployment>.convex.site/resend/inbound` and the event
   `email.received`.
2. Copy its signing secret (`whsec_…`) and set it as `RESEND_WEBHOOK_SECRET`
   on the Convex deployment. Until it's set, the route answers 500 and
   nothing is processed.

Resend retries deliveries that don't get a 200, and the app dedupes them by
email id and Message-ID.

## 8. Try email

1. Open Connections in the app. The Email row should say ready; claim a
   handle.
2. From your sign-in address, email `handle@mail.example.com`. A reply from
   the lead arrives in the same thread. Start the subject or first line
   with `@Ivy` to reach a bot.
3. If nothing comes back, the Convex logs say why by id and reason:
   `Inbound email <id> rejected: <reason>`. `from_mismatch` means the mail
   didn't come from your verified sign-in address; `dmarc_fail` or
   `dkim_unaligned` mean your sending provider doesn't sign for your
   address; `unknown_mailbox` means the handle isn't claimed;
   `rate_limited` means more than a burst of 5 and 20 an hour.

## 9. Photon: iMessage and SMS

1. In the Photon dashboard, open the project and copy its project id and
   secret into `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET`.
2. Add a webhook pointing at `https://<deployment>.convex.site/spectrum/webhook`
   and copy its signing secret into `SPECTRUM_WEBHOOK_SECRET`. The route
   refuses deliveries without it, or with a bad or stale signature.
3. Photon provisions the iMessage line (a shared pool on Free and Pro, a
   dedicated number on Business). When a recipient isn't on iMessage, the
   line falls back to SMS or RCS by itself, so there's nothing to set up for
   SMS.
4. In the app, open Messaging, get a code, and text `link <code>` to the
   line from your phone.

## 10. Telegram

1. In Telegram, message @BotFather, send `/newbot`, and copy the token.
2. Set it as `TELEGRAM_BOT_TOKEN` on the Convex deployment.
3. In Photon, add the Telegram provider to the project.
4. Point the bot's webhook at Photon once:
   `pnpm exec convex run api/sender:connectTelegram`
5. In the app, get a code on Messaging and send `link <code>` to the bot.

## 11. WhatsApp

1. In Photon, add a WhatsApp Business number to the project. Photon holds
   the Meta credentials, so the project keys from step 9 are enough.
2. In the app, get a code on Messaging and send `link <code>` to the number
   from WhatsApp.

WhatsApp allows free-form replies only within 24 hours of your last
message. A reminder texted outside that window fails to send but still
posts in the chat.

## 12. Phone calls: why not yet

Connections lists phone calls as coming soon. The reasons, as of this
writing:

- Photon's voice product is SIP only: a SIP trunk over TLS on port 5061,
  with RTP for the audio. There is no call control in the SDK and no
  webhook for call events, so a Convex action can't place, answer or steer
  a call.
- The RTP audio is unencrypted, so a server bridging it would be handling
  the user's voice in the clear on the network between it and Photon.
- A call needs an always-on process that speaks SIP and RTP, keeps a socket
  open for the length of the call, and streams audio both ways. Convex
  actions are short-lived HTTP functions; that process would have to live
  elsewhere (a small voice server) and talk to the app over HTTP.

What it would take: a voice server that registers with Photon's SIP line,
turns each call into the same turn pipeline the in-app calls use (upload a
clip, `calls.turn`, play the reply), and reports the call to the app so it
lands in the call history. That is worth building once Photon ships call
control and webhooks, or if a different voice provider with an HTTP API is
chosen. In-app calls, and reminders that ring you in the app, work today.
