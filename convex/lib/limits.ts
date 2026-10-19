import { HOUR, RateLimiter } from '@convex-dev/rate-limiter'
import { components } from '../_generated/api'

/** Per-user limits on what comes in from outside. Each name is one bucket per key. */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  /** Emails one owner can have answered: a burst of 5, then 20 an hour. */
  inboundEmail: { kind: 'token bucket', rate: 20, period: HOUR, capacity: 5 },
})
