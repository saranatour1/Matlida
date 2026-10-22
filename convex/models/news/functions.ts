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
import { briefingMarkdown, dueDay, fetchNews } from '../../lib/news'
import schema from '../../schema'
import { getOwnedProject } from '../projects/functions'
import { zTimeZone } from '../threads/chat'
import { ensureMainThread } from '../threads/functions'
import type { Doc, Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'

async function getSettings(ctx: Pick<QueryCtx, 'db'>, userId: Id<'users'>) {
  return await ctx.db
    .query('newsSettings')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
}

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
      // A new daily time can go out today.
      lastSentDay:
        existing && existing.dailyHour === fields.dailyHour
          ? existing.lastSentDay
          : undefined,
    }
    if (existing) await ctx.db.replace('newsSettings', existing._id, row)
    else await ctx.db.insert('newsSettings', row)
  },
})

const forUser = internalQuery({
  args: { userId: v.id('users') },
  returns: v.union(schema.doc('newsSettings'), v.null()),
  handler: async (ctx, { userId }) => await getSettings(ctx, userId),
})

/** Everyone with a daily time, all of them, by the `by_dailyHour` index. */
const withDailyTime = internalQuery({
  args: {},
  returns: v.array(schema.doc('newsSettings')),
  handler: async (ctx) => {
    const daily = []
    for await (const row of ctx.db
      .query('newsSettings')
      .withIndex('by_dailyHour', (q) => q.gte('dailyHour', 0))) {
      daily.push(row)
    }
    return daily
  },
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

/** Hourly from `crons.ts`: sends each daily briefing at its hour in the user's zone. */
const sendDaily = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const all: Array<Doc<'newsSettings'>> = await ctx.runQuery(
      internal.api.news.withDailyTime,
      {},
    )
    const now = Date.now()
    for (const found of all) {
      const day = dueDay(found, now)
      if (!day) continue
      try {
        // ponytail: daily searches aren't recorded in usage, which needs a reply's thread.
        const sections = await fetchNews(
          budgetedModel(ctx, found.userId, MODELS.search),
          found,
        )
        if (!sections.some((s) => s.stories.length)) continue
        await ctx.runMutation(internal.api.news.postBriefing, {
          id: found._id,
          day,
          markdown: briefingMarkdown(sections),
        })
      } catch (error) {
        // Tried again next hour only if the hour still matches; otherwise tomorrow.
        console.error(error)
      }
    }
    return null
  },
})

export const newsApi = {
  settings,
  saveSettings,
  forUser,
  withDailyTime,
  postBriefing,
  sendDaily,
}
