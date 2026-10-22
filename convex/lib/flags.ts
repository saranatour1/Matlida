import { env } from '../_generated/server'

/** Feature flags in Cloudflare Flagship, by their key there. */
export const FLAGS = {
  /** Assistants can phone a number you type. Off unless Flagship turns it on for you: it costs money and can be abused. */
  phoneCalls: 'phone-calls',
} as const

/**
 * Whether `flag` is on for `userId`. Flagship is read through the Worker's
 * binding, so this asks the Worker's /api/flags with `FLAGS_SECRET`, with the
 * user's id as the targeting key. Off when that isn't set up, fails or says
 * no, so a risky feature stays off by default. A deployment can turn flags on
 * for everyone with `FLAGS_ON`, like dev with `phone-calls`.
 */
export const flagOn = async (
  flag: (typeof FLAGS)[keyof typeof FLAGS],
  userId: string,
) => {
  if (env.FLAGS_ON?.split(',').some((on) => on.trim() === flag)) return true
  const secret = env.FLAGS_SECRET
  if (!secret) return false
  try {
    const response = await fetch(`${env.FLAGS_URL ?? env.SITE_URL}/api/flags`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ flag, userId }),
    })
    if (!response.ok) return false
    const { on } = (await response.json()) as { on?: unknown }
    return on === true
  } catch (error) {
    console.error(error)
    return false
  }
}
