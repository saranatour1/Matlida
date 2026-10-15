const VERIFIER_KEY = 'openrouter-pkce-verifier'

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Starts OpenRouter's OAuth sign-in (PKCE). OpenRouter sends the browser back
 * to `/settings/openrouter` with a code to trade for a key.
 */
export async function startOpenRouterSignIn() {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = base64Url(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    ),
  )
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  const callback = `${location.origin}/settings/openrouter`
  location.assign(
    `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callback)}&code_challenge=${challenge}&code_challenge_method=S256`,
  )
}

/** The verifier saved by `startOpenRouterSignIn`. It can be read once. */
export function takeOpenRouterVerifier() {
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  return verifier
}
