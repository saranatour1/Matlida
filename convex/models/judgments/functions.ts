import { v } from 'convex/values'
import { internalMutation, internalQuery } from '../../_generated/server'
import { judgmentsTable } from './table'

const record = internalMutation({
  args: judgmentsTable.validator,
  returns: v.null(),
  handler: async (ctx, judgment) => {
    await ctx.db.insert('judgments', judgment)
    return null
  },
})

/**
 * The latest 500 answers of `kind`: what code did with them, and how each
 * score spread over tenths. Run `pnpm exec convex run api/judgments:summary
 * '{"kind":"check_in"}'` before moving a threshold.
 */
const summary = internalQuery({
  args: { kind: judgmentsTable.validator.fields.kind },
  returns: v.object({
    count: v.number(),
    outcomes: v.record(v.string(), v.number()),
    scores: v.record(v.string(), v.array(v.number())),
  }),
  handler: async (ctx, { kind }) => {
    const rows = await ctx.db
      .query('judgments')
      .withIndex('by_kind', (q) => q.eq('kind', kind))
      .order('desc')
      .take(500)
    const outcomes: Record<string, number> = {}
    const scores: Record<string, Array<number>> = {}
    for (const row of rows) {
      outcomes[row.outcome] = (outcomes[row.outcome] ?? 0) + 1
      for (const [name, score] of Object.entries(row.scores)) {
        const tenths = (scores[name] ??= Array<number>(10).fill(0))
        tenths[Math.min(9, Math.floor(score * 10))]++
      }
    }
    return { count: rows.length, outcomes, scores }
  },
})

export const judgmentsApi = { record, summary }
