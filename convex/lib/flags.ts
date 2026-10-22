import { env } from '../_generated/server'

/** Feature flags in Cloudflare Flagship, by their key there. */
export const FLAGS = {
  /** Assistants can phone a number you type. Off unless Flagship turns it on for you: it costs money and can be abused. */
  phoneCalls: 'phone-calls',
} as const

/**
 * Whether `flag` is on for `userId`, asked of Flagship's evaluation API with
 * the user's id as the targeting key. Off when Flagship isn't set up, fails
 * or says no, so a risky feature stays off by default.
 */
export const flagOn = async (
  flag: (typeof FLAGS)[keyof typeof FLAGS],
  userId: string,
) => {
  const {
    FLAGSHIP_ACCOUNT_ID: account,
    FLAGSHIP_APP_ID: app,
    FLAGSHIP_API_TOKEN: token,
  } = env
  if (!account || !app || !token) return false
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/flagship/apps/${app}/evaluate`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          flagKey: flag,
          context: { targetingKey: userId },
        }),
      },
    )
    if (!response.ok) return false
    const body = (await response.json()) as {
      value?: unknown
      result?: { value?: unknown }
    }
    // The API may wrap its answer in Cloudflare's usual `result`.
    return (body.result?.value ?? body.value) === true
  } catch (error) {
    console.error(error)
    return false
  }
}
