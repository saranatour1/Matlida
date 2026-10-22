import { z } from 'zod'

/**
 * Handles are the part before the @ in a user's assistant address,
 * `handle@MAIL_DOMAIN`. Lowercase `a-z`, `0-9`, dots, dashes and underscores,
 * 3 to 32 characters, with no dot at either end or doubled, so every handle
 * is a valid email local part that needs no quoting.
 */
export const HANDLE_MIN = 3
export const HANDLE_MAX = 32

const HANDLE_CHARACTERS = /^[a-z0-9._-]+$/

/**
 * Role names nobody can claim: RFC 2142's mailbox names, the usual
 * automated senders, and names that would read as the app or its staff.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // RFC 2142
  'postmaster',
  'hostmaster',
  'webmaster',
  'abuse',
  'security',
  'noc',
  'usenet',
  'news',
  'uucp',
  'ftp',
  'www',
  'info',
  'marketing',
  'sales',
  'support',
  // Administration
  'admin',
  'administrator',
  'root',
  'sysadmin',
  'owner',
  'staff',
  'team',
  'system',
  'daemon',
  // Automated senders
  'noreply',
  'no-reply',
  'no_reply',
  'donotreply',
  'do-not-reply',
  'do_not_reply',
  'mailer-daemon',
  'mailer_daemon',
  'mailerdaemon',
  'bounce',
  'bounces',
  'notification',
  'notifications',
  'alert',
  'alerts',
  'reply',
  'replies',
  // Mail operations
  'dmarc',
  'dmarc-reports',
  'dmarc_reports',
  'abuse-reports',
  'spam',
  'phishing',
  'mail',
  'email',
  'inbox',
  // Accounts and the app itself
  'help',
  'billing',
  'contact',
  'legal',
  'privacy',
  'press',
  'account',
  'accounts',
  'auth',
  'login',
  'signup',
  'verify',
  'verification',
  'password',
  'reset',
  'matilda',
])

/**
 * Normalizes what the user typed (trimmed, lowercased) and says what's wrong
 * with it, in words for the form. Reserved names are refused here too.
 */
export const parseHandle = (
  input: string,
): { ok: true; handle: string } | { ok: false; reason: string } => {
  const handle = input.trim().toLowerCase()
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) {
    return {
      ok: false,
      reason: `Handles are ${HANDLE_MIN} to ${HANDLE_MAX} characters.`,
    }
  }
  if (!HANDLE_CHARACTERS.test(handle)) {
    return {
      ok: false,
      reason:
        'Use only lowercase letters, digits, dots, dashes and underscores.',
    }
  }
  if (handle.startsWith('.') || handle.endsWith('.') || handle.includes('..')) {
    return {
      ok: false,
      reason: 'A handle can’t start or end with a dot, or have two in a row.',
    }
  }
  if (RESERVED_HANDLES.has(handle)) {
    return { ok: false, reason: 'That name is reserved. Pick another.' }
  }
  return { ok: true, handle }
}

/** `handle@domain`, the address people write to. */
export const addressOf = (handle: string, domain: string) => {
  return `${handle}@${domain}`
}

/** The handle of an address at `domain`, or null when it's another domain or malformed. */
export const handleOf = (address: string, domain: string) => {
  const at = address.lastIndexOf('@')
  if (at < 1) return null
  if (address.slice(at + 1).toLowerCase() !== domain.toLowerCase()) return null
  return address.slice(0, at).toLowerCase()
}

/** A handle as a form field: normalized, with the reason as the issue when it's refused. */
export const zHandle = z
  .string()
  .max(200)
  .transform((value, context) => {
    const parsed = parseHandle(value)
    if (!parsed.ok) {
      context.addIssue({ code: 'custom', message: parsed.reason })
      return z.NEVER
    }
    return parsed.handle
  })
