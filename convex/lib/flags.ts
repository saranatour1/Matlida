import { env } from '../_generated/server'

/**
 * Features behind a flag in Cloudflare Flagship: the Flagship flag that
 * decides each, and the value of it that turns the feature on.
 */
export const FLAGS = {
  /**
   * Assistants can phone a number you type. Flagship's `no-calls` is on for
   * everyone; its rule serves it off for the users who may call. It costs
   * money and can be abused.
   */
  phoneCalls: { name: 'phone-calls', key: 'no-calls', onWhen: false },
} as const

/**
 * Whether `flag`'s feature is on for `userId`. Flagship is read through the
 * Worker's binding, so this asks the Worker's /api/flags with `FLAGS_SECRET`,
 * with the user's id as the targeting key. Off when that isn't set up, fails
 * or says no, so a risky feature stays off by default: the Worker's own
 * fallback, if Flagship doesn't answer, is the value that keeps it off. A
 * deployment can turn features on for everyone with `FLAGS_ON`, like dev with
 * `phone-calls`.
 */
export const flagOn = async (
  flag: (typeof FLAGS)[keyof typeof FLAGS],
  userId: string,
) => {
  if (env.FLAGS_ON?.split(',').some((on) => on.trim() === flag.name)) {
    return true
  }
  const secret = env.FLAGS_SECRET
  if (!secret) return false
  try {
    const response = await fetch(`${env.FLAGS_URL ?? env.SITE_URL}/api/flags`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        flag: flag.key,
        userId,
        fallback: !flag.onWhen,
      }),
    })
    if (!response.ok) return false
    const { value } = (await response.json()) as { value?: unknown }
    return value === flag.onWhen
  } catch (error) {
    console.error(error)
    return false
  }
}
