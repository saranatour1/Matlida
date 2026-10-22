import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Each answer Jev gave that code acted on, and what code did with it, so
 * `JEV_THRESHOLDS` in `lib/decide` can be tuned from real answers
 * (`judgments.summary`).
 */
export const judgmentsTable = defineTable({
  userId: v.id('users'),
  kind: literals('after_missed_call', 'recurring', 'check_in', 'answer'),
  /** Jev's probabilities, by question or option. */
  scores: v.record(v.string(), v.number()),
  /** The option Jev picked, for a choice. */
  choice: v.optional(v.string()),
  /** What the code did with it. */
  outcome: v.string(),
}).index('by_kind', ['kind'])
