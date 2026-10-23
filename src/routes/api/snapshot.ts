import { createFileRoute } from '@tanstack/react-router'
import { env, waitUntil } from 'cloudflare:workers'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { handleSnapshot } from '~/lib/snapshots'

const { VITE_CONVEX_URL: CONVEX_URL, VITE_CONVEX_SITE_URL } = (
  import.meta as any
).env as { VITE_CONVEX_URL: string; VITE_CONVEX_SITE_URL?: string }
// Convex Auth signs tokens as the deployment's site URL (convex/auth.config.ts).
// `convex dev` writes it to .env.local; a build without it falls back to the default *.convex.site.
const SITE_URL =
  VITE_CONVEX_SITE_URL ??
  CONVEX_URL.replace(/\.convex\.cloud\/?$/, '.convex.site')
const jwks = createRemoteJWKSet(new URL(`${SITE_URL}/auth/.well-known/jwks.json`))

/** The signed-in user's last result for a query, from KV, for useQuery in ~/lib/query-snapshots. */
export const Route = createFileRoute('/api/snapshot')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleSnapshot(request, {
          kv: env.snapshot,
          waitUntil,
          now: Date.now,
          verify: async (token) => {
            try {
              const { payload } = await jwtVerify(token, jwks, {
                issuer: SITE_URL,
                audience: 'convex',
              })
              // Convex Auth's subject is `userId|sessionId`.
              return payload.sub?.split('|')[0] || null
            } catch {
              return null
            }
          },
          run: (token, name, args) => {
            const client = new ConvexHttpClient(CONVEX_URL)
            client.setAuth(token)
            return client.query(makeFunctionReference<'query'>(name), args)
          },
        }),
    },
  },
})
