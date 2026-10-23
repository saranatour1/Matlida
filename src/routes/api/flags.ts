import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'

/**
 * A boolean feature flag's value for a user, for Convex: the flags live in
 * Cloudflare Flagship, which only the Worker's binding can read. `fallback`
 * is what to answer if Flagship can't, so the caller picks the safe side.
 * Only callers with `FLAGS_SECRET` get an answer, so nobody can probe it.
 */
export const Route = createFileRoute('/api/flags')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = env.FLAGS_SECRET
        // ponytail: plain comparison of a long random secret over HTTPS; timing-safe compare if it ever guards more.
        if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
          return new Response('Not found', { status: 404 })
        }
        const { flag, userId, fallback } = (await request.json()) as {
          flag?: unknown
          userId?: unknown
          fallback?: unknown
        }
        // An unknown flag gets the fallback from Flagship.
        if (
          typeof flag !== 'string' ||
          typeof userId !== 'string' ||
          typeof fallback !== 'boolean'
        ) {
          return new Response('Bad request', { status: 400 })
        }
        const value = await env.NO_PHONE_CALLS_YET.getBooleanValue(
          flag,
          fallback,
          { targetingKey: userId },
        )
        return Response.json({ value })
      },
    },
  },
})
