import { literals } from 'convex-helpers/validators'
import { zid } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import {
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import schema from '../../schema'
import { getOwnedProject } from '../projects/functions'
import { createAgent } from '../threads/lead'
import { pagesTable, vMetric } from './table'
import type { Doc, Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'

/** The page when `userId` owns its workspace, or null. `id` may come from a model, so it may not be an id. */
async function getOwnedPage(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
  id: string,
) {
  const pageId = ctx.db.normalizeId('pages', id)
  const page = pageId && (await ctx.db.get('pages', pageId))
  const project = page && (await ctx.db.get('projects', page.projectId))
  return project?.ownerId === userId ? page : null
}

const list = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await ctx.db
      .query('pages')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .order('desc')
      .take(50)
  },
})

const get = authedQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => await getOwnedPage(ctx, ctx.userId, id),
})

/** Your edits from the page's editor. */
const save = zAuthedMutation({
  args: {
    id: zid('pages'),
    title: z
      .string()
      .trim()
      .min(1, 'Give the page a title.')
      .max(120, 'Titles can be at most 120 characters.'),
    markdown: z.string().max(50_000, 'Pages can be at most 50,000 characters.'),
  },
  handler: async (ctx, { id, title, markdown }) => {
    if (!(await getOwnedPage(ctx, ctx.userId, id))) {
      throw new ConvexError('Page not found.')
    }
    await ctx.db.patch('pages', id, { title, markdown, updatedBy: 'You' })
  },
})

/** The page's "Keep up to date" setting. Null `every` turns it off. */
const setRefresh = authedMutation({
  args: {
    id: v.id('pages'),
    every: v.union(literals('day', 'week'), v.null()),
    instructions: v.string(),
  },
  handler: async (ctx, { id, every, instructions }) => {
    if (!(await getOwnedPage(ctx, ctx.userId, id))) {
      throw new ConvexError('Page not found.')
    }
    if (every && !instructions.trim()) {
      throw new ConvexError('Say what to keep up to date.')
    }
    await ctx.db.patch('pages', id, {
      refresh: every
        ? { every, instructions: instructions.trim().slice(0, 1000) }
        : undefined,
      // The first refresh waits a full period from now.
      refreshedAt: Date.now(),
    })
  },
})

const remove = authedMutation({
  args: { id: v.id('pages') },
  handler: async (ctx, { id }) => {
    if (!(await getOwnedPage(ctx, ctx.userId, id))) {
      throw new ConvexError('Page not found.')
    }
    await ctx.db.delete('pages', id)
  },
})

/** `write_page`: a new page, or the whole of one in this workspace replaced. */
const write = internalMutation({
  args: {
    projectId: v.id('projects'),
    threadId: v.string(),
    pageId: v.optional(v.string()),
    title: v.string(),
    kind: pagesTable.validator.fields.kind,
    markdown: v.string(),
    metrics: v.optional(v.array(vMetric)),
    updatedBy: v.string(),
  },
  returns: v.id('pages'),
  handler: async (ctx, { pageId, ...page }) => {
    if (!pageId) return await ctx.db.insert('pages', page)
    const id = ctx.db.normalizeId('pages', pageId)
    const existing = id && (await ctx.db.get('pages', id))
    if (!existing || existing.projectId !== page.projectId) {
      throw new Error('No such page in this workspace.')
    }
    await ctx.db.patch('pages', existing._id, {
      title: page.title,
      kind: page.kind,
      markdown: page.markdown,
      metrics: page.metrics,
      updatedBy: page.updatedBy,
    })
    return existing._id
  },
})

/** `read_page`: the page as it is now, the user's edits included. */
const read = internalQuery({
  args: { projectId: v.id('projects'), pageId: v.string() },
  returns: v.union(schema.doc('pages'), v.null()),
  handler: async (ctx, { projectId, pageId }) => {
    const id = ctx.db.normalizeId('pages', pageId)
    const page = id && (await ctx.db.get('pages', id))
    return page?.projectId === projectId ? page : null
  },
})

/** `keep_page_updated`: an assistant sets or stops the schedule. */
const keepUpdated = internalMutation({
  args: {
    projectId: v.id('projects'),
    pageId: v.string(),
    every: literals('day', 'week', 'off'),
    instructions: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { projectId, pageId, every, instructions }) => {
    const id = ctx.db.normalizeId('pages', pageId)
    const page = id && (await ctx.db.get('pages', id))
    if (page?.projectId !== projectId) throw new Error('No such page.')
    if (every !== 'off' && !instructions) {
      throw new Error('Say in `instructions` what to keep up to date.')
    }
    await ctx.db.patch('pages', page._id, {
      refresh:
        every === 'off' || !instructions ? undefined : { every, instructions },
      // The first refresh waits a full period from now.
      refreshedAt: Date.now(),
    })
    return null
  },
})

const HOUR = 60 * 60_000
const PERIOD = { day: 23 * HOUR, week: 7 * 24 * HOUR - HOUR }

/** Pages due a refresh. ponytail: scans recent pages, fine until there are thousands. */
const due = internalQuery({
  args: {},
  returns: v.array(schema.doc('pages')),
  handler: async (ctx) => {
    const now = Date.now()
    return (await ctx.db.query('pages').order('desc').take(500)).filter(
      (p) => p.refresh && now - (p.refreshedAt ?? 0) >= PERIOD[p.refresh.every],
    )
  },
})

const refreshed = internalMutation({
  args: { id: v.id('pages') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.patch('pages', id, { refreshedAt: Date.now() })
    return null
  },
})

/**
 * Hourly from `crons.ts`: the lead updates each page that's due, in its own
 * thread under the chat that made the page, with tools that read and look
 * things up, and saves it with `write_page`.
 */
const refreshDue = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const pages: Array<Doc<'pages'>> = await ctx.runQuery(
      internal.api.pages.due,
      {},
    )
    for (const page of pages) {
      // Marked first, so a failure waits a period instead of retrying hourly.
      await ctx.runMutation(internal.api.pages.refreshed, { id: page._id })
      const project = await ctx.runQuery(internal.api.pages.projectOf, {
        id: page._id,
      })
      if (!project || !page.refresh) continue
      try {
        const threadId: string = await ctx.runMutation(
          internal.api.threads.start,
          {
            projectId: project._id,
            kind: 'subagent',
            title: `Updating ${page.title}`,
            parentThreadId: page.threadId || undefined,
            userId: project.ownerId,
          },
        )
        const agent = createAgent(ctx, project, {
          tools: [
            'read_page',
            'write_page',
            'web_search',
            'research',
            'get_today',
            'find_emails',
            'find_texts',
          ],
        })
        await agent.generateText(
          ctx,
          { threadId, userId: project.ownerId },
          {
            prompt: `Keep the page "${page.title}" (pageId ${page._id}) up to date: ${page.refresh.instructions}\nRead it first with read_page and keep the user's own edits and structure. Change only what's out of date, then save the whole page with write_page.`,
          },
        )
      } catch (error) {
        console.error(error)
      }
    }
    return null
  },
})

const projectOf = internalQuery({
  args: { id: v.id('pages') },
  returns: v.union(schema.doc('projects'), v.null()),
  handler: async (ctx, { id }) => {
    const page = await ctx.db.get('pages', id)
    return page && (await ctx.db.get('projects', page.projectId))
  },
})

export const pagesApi = {
  list,
  get,
  save,
  setRefresh,
  remove,
  write,
  read,
  keepUpdated,
  due,
  refreshed,
  refreshDue,
  projectOf,
}
