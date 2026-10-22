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
  }
}
