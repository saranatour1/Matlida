import { useQuery } from 'convex/react'
import type { SignInMethod } from '~/lib/analytics'
import { api } from '~/lib/api'
import { identifyUser, trackEvent } from '~/lib/analytics'

/** Where the sign-in page leaves the method you picked, for the signed_in event. */
export const SIGN_IN_METHOD_KEY = 'matilda.signInMethod'

/**
 * Ties analytics to the signed-in user (their id only) and counts the
 * sign-in. Calling it while rendering is safe: it does nothing once this
 * browser already has that user, so a re-render never sends twice.
 */
export function IdentifyUser() {
  const user = useQuery(api.users.current)
  if (user && identifyUser(user._id)) {
    let method: SignInMethod | 'returning' = 'returning'
    try {
      method =
        (sessionStorage.getItem(SIGN_IN_METHOD_KEY) as SignInMethod | null) ??
        'returning'
      sessionStorage.removeItem(SIGN_IN_METHOD_KEY)
    } catch {
      // Storage can be off; the event still counts.
    }
    trackEvent('signed_in', { method })
  }
  return null
}

/** Remembers the method for the signed_in event after the sign-in completes. */
export const rememberSignInMethod = (method: SignInMethod) => {
  trackEvent('sign_in_started', { method })
  try {
    sessionStorage.setItem(SIGN_IN_METHOD_KEY, method)
  } catch {
    // Without storage the sign-in counts as returning.
  }
}
