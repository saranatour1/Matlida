import { createTool } from '@convex-dev/agent'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import type { Doc } from '../../lib/ctx'

const zMetric = z.object({
  label: z.string().min(1).max(40),
  value: z.number(),
  suffix: z.string().max(12).optional().describe('Like %, k or users.'),
  change: z.string().max(40).optional().describe('Like +12% this week.'),
  context: z.string().max(120).optional().describe('What the number means.'),
  trend: z
    .array(z.number())
    .min(2)
    .max(30)
    .optional()
    .describe('Recent values, oldest first, for a sparkline.'),
})

/**
 * Pages the user and the assistants edit together: reports, memos and
 * dashboards. An assistant can keep one up to date on a schedule.
 */
export const pageTools = (project: Doc<'projects'>, from: string) => {
  return {
    write_page: createTool({
      description:
        "Save a page the user can open, edit and share: a report, a memo or a dashboard. Pass pageId to replace a page with your new version, after read_page so the user's edits are kept. For a dashboard, give 3 to 8 metrics with real numbers only, and notes in the markdown with sources.",
      inputSchema: z.object({
        pageId: z.string().optional(),
        title: z.string().min(1).max(120),
        kind: z.enum(['report', 'memo', 'dashboard']),
        markdown: z.string().max(50_000),
        metrics: z.array(zMetric).max(8).optional(),
      }),
      execute: async (ctx, page) => {
        const pageId: string = await ctx.runMutation(internal.api.pages.write, {
          projectId: project._id,
          threadId: ctx.threadId ?? '',
          updatedBy: from,
          ...page,
        })
        return { pageId, title: page.title, kind: page.kind }
      },
    }),
    read_page: createTool({
      description:
        "Read a page as it is now, with the user's own edits, before changing it.",
      inputSchema: z.object({ pageId: z.string() }),
      execute: async (ctx, { pageId }) => {
        const page: Doc<'pages'> | null = await ctx.runQuery(
          internal.api.pages.read,
          { projectId: project._id, pageId },
        )
        if (!page) throw new Error('No such page in this workspace.')
        return {
          title: page.title,
          kind: page.kind,
          markdown: page.markdown,
          metrics: page.metrics ?? [],
          updatedBy: page.updatedBy,
        }
      },
    }),
    keep_page_updated: createTool({
      description:
        'Have the page kept up to date: every day or week you update it following `instructions` (like "refresh the numbers and add this week\'s news"). Use every "off" to stop.',
      inputSchema: z.object({
        pageId: z.string(),
        every: z.enum(['day', 'week', 'off']),
        instructions: z.string().max(1000).optional(),
      }),
      execute: async (ctx, setting) => {
        await ctx.runMutation(internal.api.pages.keepUpdated, {
          projectId: project._id,
          ...setting,
        })
        return { pageId: setting.pageId, every: setting.every }
      },
    }),
  }
}
