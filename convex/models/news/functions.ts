import { saveMessage } from '@convex-dev/agent'
import { zid } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import { z } from 'zod'
import { components, internal } from '../../_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import { budgetedModel } from '../../lib/budget'
import { MODELS } from '../../lib/models'
import { authedQuery, zAuthedMutation } from '../../lib/functions'
import { briefingMarkdown, fetchNews, nextDaily } from '../../lib/news'
import { localDayHour } from '../../lib/time'
import schema from '../../schema'
import { getOwnedProject } from '../projects/queries'
import { zTimeZone } from '../threads/chat'
import { ensureMainThread } from '../threads/functions'
import { getSettings } from './queries'
import type { Doc, Id, MutationCtx } from '../../lib/ctx'

/** Your news settings, for the setup card. Null before you save them. */
const settings = authedQuery({
  args: {},
  handler: async (ctx) => await getSettings(ctx, ctx.userId),
})

const zName = z.string().trim().min(1).max(40)

const saveSettings = zAuthedMutation({
  args: {
    projectId: zid('projects'),
    topics: z.array(zName).min(1, 'Pick at least one topic.').max(8),
    regions: z.array(zName).max(5),
    avoid: z
      .string()
      .trim()
      .max(200)
      .transform((s) => s || undefined)
      .optional(),
    perTopic: z.number().int().min(2).max(5),
    dailyHour: z.number().int().min(0).max(23).optional(),
    timeZone: zTimeZone.optional(),
  },
  handler: async (ctx, { projectId, ...fields }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    const existing = await getSettings(ctx, ctx.userId)
    const row = {
      userId: ctx.userId,
      projectId,
      ...fields,
      job: existing?.job,
      // A new daily time can go out today.
      lastSentDay:
        existing && existing.dailyHour === fields.dailyHour
          ? existing.lastSentDay
          : undefined,
    }
    let id = existing?._id
    if (existing) await ctx.db.replace('newsSettings', existing._id, row)
    else id = await ctx.db.insert('newsSettings', row)
    if (id) await scheduleDaily(ctx, id)
  },
})

/**
 * Schedules the next daily briefing at its hour, replacing the one pending.
 * No daily time ("Only when I ask") schedules nothing, which is how it's
 * cancelled.
 */
const scheduleDaily = async (ctx: MutationCtx, id: Id<'newsSettings'>) => {
  const found = await ctx.db.get('newsSettings', id)
  const pending = found?.job && (await ctx.db.system.get("_scheduled_functions", found.job))
  if (pending && pending.state.kind === 'pending') {
    await ctx.scheduler.cancel(pending._id)
  }
  if (found?.dailyHour === undefined) {
    if (found?.job) await ctx.db.patch('newsSettings', id, { job: undefined })
    return
  }
  const job = await ctx.scheduler.runAt(
    nextDaily(found.dailyHour, found.timeZone, Date.now()),
    internal.api.news.sendDaily,
    { id },
  )
  await ctx.db.patch('newsSettings', id, { job })
}

/** Schedules tomorrow's briefing, after today's went out (or failed). */
const scheduleNext = internalMutation({
  args: { id: v.id('newsSettings') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await scheduleDaily(ctx, id)
    return null
  },
})

const get = internalQuery({
  args: { id: v.id('newsSettings') },
  returns: v.union(schema.doc('newsSettings'), v.null()),
  handler: async (ctx, { id }) => await ctx.db.get('newsSettings', id),
})

const forUser = internalQuery({
  args: { userId: v.id('users') },
  returns: v.union(schema.doc('newsSettings'), v.null()),
  handler: async (ctx, { userId }) => await getSettings(ctx, userId),
})

/** Posts the daily briefing in the lead's chat, once that day. */
const postBriefing = internalMutation({
  args: {
    id: v.id('newsSettings'),
    day: v.string(),
    markdown: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { id, day, markdown }) => {
    const found = await ctx.db.get('newsSettings', id)
    const project = found && (await ctx.db.get('projects', found.projectId))
    if (!found || !project || found.lastSentDay === day) return null
    const threadId = await ensureMainThread(ctx, project, null)
    await saveMessage(ctx, components.agent, {
      threadId,
      message: { role: 'assistant', content: markdown },
    })
    await ctx.db.patch('newsSettings', id, { lastSentDay: day })
    return null
  },
})

/**
 * One person's daily briefing, scheduled at their hour (`scheduleDaily`):
 * posts it in the lead's chat, then schedules tomorrow's.
 */
const sendDaily = internalAction({
  args: { id: v.id('newsSettings') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const found: Doc<'newsSettings'> | null = await ctx.runQuery(
      internal.api.news.get,
      { id },
    )
    if (found?.dailyHour === undefined) return null
    try {
      // ponytail: daily searches aren't recorded in usage, which needs a reply's thread.
      const sections = await fetchNews(
        budgetedModel(ctx, found.userId, MODELS.search),
        found,
      )
      if (sections.some((s) => s.stories.length)) {
        await ctx.runMutation(internal.api.news.postBriefing, {
          id,
          day: localDayHour(Date.now(), found.timeZone).day,
          markdown: briefingMarkdown(sections),
        })
      }
    } catch (error) {
      // Missed today; tomorrow's still goes out.
      console.error(error)
    }
    await ctx.runMutation(internal.api.news.scheduleNext, { id })
    return null
  },
})

export const newsApi = {
  settings,
  saveSettings,
  forUser,
  get,
  scheduleNext,
  postBriefing,
  sendDaily,
}
