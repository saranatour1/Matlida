import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'

/**
 * Whether a feature flag is on for a user, for Convex: the flags live in
 * Cloudflare Flagship, which only the Worker's binding can read. Only callers
 * with `FLAGS_SECRET` get an answer, so nobody can probe it.
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
        const { flag, userId } = (await request.json()) as {
          flag?: unknown
          userId?: unknown
        }
        // An unknown flag is simply off: Flagship answers with the fallback.
        if (typeof flag !== 'string' || typeof userId !== 'string') {
          return new Response('Bad request', { status: 400 })
        }
        const on = await env.NO_PHONE_CALLS_YET.getBooleanValue(
          flag,
          false,
          { targetingKey: userId },
        )
        return Response.json({ on })
      },
    },
  },
})
