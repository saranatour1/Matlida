/** What the Worker gets from wrangler.jsonc and its secrets: only what the app reads. */
declare module 'cloudflare:workers' {
  export const env: {
    /** The Flagship app with the app's feature flags. */
    NO_PHONE_CALLS_YET: {
      getBooleanValue: (
        flag: string,
        fallback: boolean,
        context?: Record<string, unknown>,
      ) => Promise<boolean>
    }
    /** Shared with Convex, which sends it to /api/flags. */
    FLAGS_SECRET?: string
    /** KV of each user's last query results, for /api/snapshot. */
    snapshot: {
      getWithMetadata: <TMetadata>(
        key: string,
      ) => Promise<{ value: string | null; metadata: TMetadata | null }>
      put: (
        key: string,
        value: string,
        options?: { metadata?: unknown },
      ) => Promise<void>
    }
  }
  /** Keeps the Worker alive for work that finishes after the response. */
  export const waitUntil: (promise: Promise<unknown>) => void
}
