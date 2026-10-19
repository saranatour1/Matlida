import { ConvexError } from 'convex/values'

/**
 * The message to show when a mutation fails: a `ConvexError` message or the first
 * Zod issue from `zMutation` args. Anything else gets `fallback`.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ConvexError)) return fallback
  const data: unknown = error.data
  if (typeof data === 'string') return data
  if (
    typeof data === 'object' &&
    data !== null &&
    'ZodError' in data &&
    Array.isArray(data.ZodError)
  ) {
    const message: unknown = data.ZodError[0]?.message
    if (typeof message === 'string') return message
  }
  return fallback
}
