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
import { getOwnedProject } from '../projects/queries'
import { createAgent } from '../threads/lead'
import { pagesTable, vMetric } from './table'
import { getOwnedPage } from './queries'
import type { Doc, Id, MutationCtx } from '../../lib/ctx'

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

const HOUR = 60 * 60_000
const PERIOD = { day: 24 * HOUR, week: 7 * 24 * HOUR }

/** Refreshed now, and next due a period from now, or never when `every` is unset. */
const refreshTimes = (every?: 'day' | 'week') => {
  const now = Date.now()
  return {
    refreshedAt: now,
    nextRefreshAt: every ? now + PERIOD[every] : undefined,
  }
}

/**
 * Schedules the page's next refresh for `nextRefreshAt`, replacing the one
 * pending. A page that isn't kept up to date schedules nothing, so turning
 * it off cancels it. Run after anything that moves `nextRefreshAt`.
 */
const scheduleRefresh = async (ctx: MutationCtx, id: Id<'pages'>) => {
  const page = await ctx.db.get('pages', id)
  if (!page) return
  const pending = page.job && (await ctx.db.system.get("_scheduled_functions", page.job))
  if (pending && pending.state.kind === 'pending') {
    await ctx.scheduler.cancel(pending._id)
  }
  const job = page.nextRefreshAt
    ? await ctx.scheduler.runAt(
        page.nextRefreshAt,
        internal.api.pages.refreshOne,
        { id },
      )
    : undefined
  await ctx.db.patch('pages', id, { job })
}

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
      ...refreshTimes(every ?? undefined),
    })
    await scheduleRefresh(ctx, id)
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
      ...refreshTimes(every === 'off' || !instructions ? undefined : every),
    })
    await scheduleRefresh(ctx, page._id)
    return null
  },
})

const refreshed = internalMutation({
  args: { id: v.id('pages') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const page = await ctx.db.get('pages', id)
    if (!page) return null
    await ctx.db.patch('pages', id, refreshTimes(page.refresh?.every))
    await scheduleRefresh(ctx, id)
    return null
  },
})

/**
 * Refreshes one kept-up-to-date page, scheduled for when it's due
 * (`scheduleRefresh`): the lead updates it with tools that read and look
 * things up, and saves it with `write_page`.
 */
const refreshOne = internalAction({
  args: { id: v.id('pages') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const page: Doc<'pages'> | null = await ctx.runQuery(
      internal.api.pages.getPage,
      { id },
    )
    if (!page?.refresh) return null
    // Marked first, which also schedules the next one, so a failure waits a period.
    await ctx.runMutation(internal.api.pages.refreshed, { id })
    const project = await ctx.runQuery(internal.api.pages.projectOf, { id })
    if (!project) return null
    try {
      // The lead's chat, for its history, with nothing saved: the page is the result.
      const threadId: string = await ctx.runMutation(
        internal.api.threads.startMain,
        { projectId: project._id },
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
        { storageOptions: { saveMessages: 'none' } },
      )
    } catch (error) {
      console.error(error)
    }
    return null
  },
})

const getPage = internalQuery({
  args: { id: v.id('pages') },
  returns: v.union(schema.doc('pages'), v.null()),
  handler: async (ctx, { id }) => await ctx.db.get('pages', id),
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
  refreshed,
  refreshOne,
  getPage,
  projectOf,
}
