import { HOUR, RateLimiter } from '@convex-dev/rate-limiter'
import { components } from '../_generated/api'

/** Per-user limits on what comes in from outside. Each name is one bucket per key. */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  /** Emails one owner can have answered: a burst of 5, then 20 an hour. */
  inboundEmail: { kind: 'token bucket', rate: 20, period: HOUR, capacity: 5 },
  /** Texts one owner (or one unlinked chat) can send: a burst of 15, then 60 an hour. */
  inboundText: { kind: 'token bucket', rate: 60, period: HOUR, capacity: 15 },
  /** `link <code>` tries from one chat: 5, then 10 an hour, so a code can't be guessed. */
  linkAttempt: { kind: 'token bucket', rate: 10, period: HOUR, capacity: 5 },
})
