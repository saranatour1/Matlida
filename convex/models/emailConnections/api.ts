import type { Infer } from 'convex/values'
import type { vEmailConfig } from './table'

type EmailConfig = Infer<typeof vEmailConfig>
export type ApiConfig = Exclude<EmailConfig, { kind: 'smtp' }>

export type Email = {
  from: string
  to: string
  subject: string
  text: string
}

function mailgunHost(region: 'us' | 'eu') {
  return region === 'eu'
    ? 'https://api.eu.mailgun.net'
    : 'https://api.mailgun.net'
}

/** Sends through a provider's HTTP API and returns the response status. */
export async function sendWithApi(
  config: ApiConfig,
  secret: string,
  email: Email,
) {
  switch (config.kind) {
    case 'resend':
      return (
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(email),
        })
      ).status
    case 'postmark':
      return (
        await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'X-Postmark-Server-Token': secret,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            From: email.from,
            To: email.to,
            Subject: email.subject,
            TextBody: email.text,
          }),
        })
      ).status
    case 'mailgun':
      return (
        await fetch(
          `${mailgunHost(config.region)}/v3/${config.domain}/messages`,
          {
            method: 'POST',
            headers: { Authorization: `Basic ${btoa(`api:${secret}`)}` },
            body: new URLSearchParams(email),
          },
        )
      ).status
    case 'cloudflare':
      return (
        await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/email/sending/send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${secret}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(email),
          },
        )
      ).status
  }
}

/** One cheap request that only succeeds with working credentials. */
export async function checkApiCredentials(config: ApiConfig, secret: string) {
  switch (config.kind) {
    case 'resend': {
      const response = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${secret}` },
      })
      if (response.ok) return true
      // Send-only keys can't list domains, but this error proves the key is real.
      const body: unknown = await response.json().catch(() => null)
      return (
        typeof body === 'object' &&
        body !== null &&
        'name' in body &&
        body.name === 'restricted_api_key'
      )
    }
    case 'postmark':
      return (
        await fetch('https://api.postmarkapp.com/server', {
          headers: {
            'X-Postmark-Server-Token': secret,
            Accept: 'application/json',
          },
        })
      ).ok
    case 'mailgun':
      return (
        await fetch(
          `${mailgunHost(config.region)}/v3/domains/${config.domain}`,
          { headers: { Authorization: `Basic ${btoa(`api:${secret}`)}` } },
        )
      ).ok
    case 'cloudflare':
      return (
        await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/tokens/verify`,
          { headers: { Authorization: `Bearer ${secret}` } },
        )
      ).ok
  }
}
