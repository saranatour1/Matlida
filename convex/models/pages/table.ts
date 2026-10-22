import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const vMetric = v.object({
  label: v.string(),
  value: v.number(),
  /** Like %, k or users. */
  suffix: v.optional(v.string()),
  /** Like "+12% this week". */
  change: v.optional(v.string()),
  /** What the number means, like "Signups in the last 7 days". */
  context: v.optional(v.string()),
  /** Recent values, oldest first, for a sparkline. */
  trend: v.optional(v.array(v.number())),
})

/**
 * A page an assistant made and you edit together: a report, a memo or a
 * dashboard. Markdown, plus headline numbers for a dashboard. An assistant
 * can keep it up to date on a schedule.
 */
export const pagesTable = defineTable({
  projectId: v.id('projects'),
  /** The chat that asked for it. */
  threadId: v.string(),
  title: v.string(),
  kind: literals('report', 'memo', 'dashboard'),
  markdown: v.string(),
  metrics: v.optional(v.array(vMetric)),
  /** Who saved it last: you, or an assistant's name. */
  updatedBy: v.string(),
  /** What to do to keep it up to date, and how often. */
  refresh: v.optional(
    v.object({ instructions: v.string(), every: literals('day', 'week') }),
  ),
  refreshedAt: v.optional(v.number()),
  /** When it's next due a refresh. Unset when it isn't kept up to date. */
  nextRefreshAt: v.optional(v.number()),
})
  .index('by_project', ['projectId'])
  .index('by_nextRefreshAt', ['nextRefreshAt'])
