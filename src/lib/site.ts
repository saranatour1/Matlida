/** The public site, for SEO: titles, canonical links and absolute image URLs. */
export const SITE_URL = (
  (import.meta.env.VITE_SITE_URL as string | undefined) ??
  'https://matilda-is-a-bot.app'
).replace(/\/$/, '')

export const SITE_NAME = 'Matilda'

export const SITE_DESCRIPTION =
  'Matilda is the only assistant you need. She texts, emails, keeps your reminders and actually calls you.'

/**
 * Databuddy's id for this site. It's public (every page sends it), so it
 * lives here rather than in a build variable the deploy could miss.
 */
export const DATABUDDY_CLIENT_ID = '8da866a7-4441-43e2-9f54-16e780dc4716'
