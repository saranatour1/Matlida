import { convexToJson, jsonToConvex } from 'convex/values'
import type { JSONValue, Value } from 'convex/values'

/** What /api/snapshot needs from the Worker, passed in so tests can fake it. */
export type SnapshotDeps = {
  kv: {
    getWithMetadata: (
      key: string,
    ) => Promise<{ value: string | null; metadata: SnapshotMeta | null }>
    put: (
      key: string,
      value: string,
      options: { metadata: SnapshotMeta },
    ) => Promise<void>
  }
  waitUntil: (promise: Promise<unknown>) => void
  now: () => number
  /** The user id in a Convex Auth token, or null when the token doesn't verify. */
  verify: (token: string) => Promise<string | null>
  /** Runs a query on Convex as the token's user. */
  run: (
    token: string,
    name: string,
    args: Record<string, Value>,
  ) => Promise<Value>
}

/** When the Worker last refreshed an entry from Convex. */
export type SnapshotMeta = { refreshedAt: number }

const FUNCTION_NAME = /^[\w/]+:\w+$/

/** How often one entry may re-run its query on Convex: at most one query and one KV write per window. */
export const REFRESH_EVERY_MS = 5 * 60_000

/** One KV key per user, query and args. Args arrive as convexToJson output. */
export const snapshotKey = async (
  userId: string,
  name: string,
  args: JSONValue,
) => {
  const bytes = new TextEncoder().encode(JSON.stringify(args))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  const hash = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  )
  return `v1:${userId}:${name}:${hash}`
}

/**
 * Answers with this user's last result for a query, or null, and refreshes it
 * in the background when it's missing or older than REFRESH_EVERY_MS. Only
 * results the Worker fetched from Convex as this user are stored, never
 * anything from the request.
 */
export const handleSnapshot = async (request: Request, deps: SnapshotDeps) => {
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer (.+)$/)?.[1]
  const userId = token ? await deps.verify(token) : null
  if (!token || !userId) return new Response('Unauthorized', { status: 401 })

  const { name, args } = (await request.json().catch(() => ({}))) as {
    name?: unknown
    args?: unknown
  }
  if (
    typeof name !== 'string' ||
    !FUNCTION_NAME.test(name) ||
    typeof args !== 'object' ||
    args === null ||
    Array.isArray(args)
  ) {
    return new Response('Bad request', { status: 400 })
  }

  const key = await snapshotKey(userId, name, args as JSONValue)
  const { value: cached, metadata } = await deps.kv.getWithMetadata(key)
  const refreshedAt = metadata?.refreshedAt ?? 0
  if (cached === null || deps.now() - refreshedAt >= REFRESH_EVERY_MS) {
    deps.waitUntil(
      deps
        .run(
          token,
          name,
          jsonToConvex(args as JSONValue) as Record<string, Value>,
        )
        // Written even when unchanged, to stamp the refresh time.
        .then((fresh) =>
          deps.kv.put(key, JSON.stringify(convexToJson(fresh)), {
            metadata: { refreshedAt: deps.now() },
          }),
        )
        // The old snapshot stays; the live query still answers the page.
        .catch((error: unknown) =>
          console.error('snapshot refresh failed', name, error),
        ),
    )
  }
  return new Response(cached ?? 'null', {
    headers: { 'content-type': 'application/json' },
  })
}
