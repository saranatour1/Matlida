/** Email providers a user can connect. Plain data, shared with the UI. */
export const EMAIL_PROVIDERS = {
  resend: { name: 'Resend', secret: 'API key', secretNoun: 'API key' },
  postmark: {
    name: 'Postmark',
    secret: 'Server token',
    secretNoun: 'server token',
  },
  mailgun: { name: 'Mailgun', secret: 'API key', secretNoun: 'API key' },
  cloudflare: {
    name: 'Cloudflare Email',
    secret: 'API token',
    secretNoun: 'API token',
  },
  smtp: {
    name: 'Your SMTP server',
    secret: 'Password',
    secretNoun: 'password',
  },
} as const

export type EmailKind = keyof typeof EMAIL_PROVIDERS

export function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === 'string' && Object.hasOwn(EMAIL_PROVIDERS, value)
}
