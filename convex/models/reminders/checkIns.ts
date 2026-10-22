import { HOUR } from '@convex-dev/rate-limiter'
import { v } from 'convex/values'
import { internal } from '../../_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import { decisionModel } from '../../lib/ai'
import { metered } from '../../lib/budget'
import { recentTurns, shouldCallNow } from '../../lib/decide'
import { rateLimiter } from '../../lib/limits'
import { MODELS } from '../../lib/models'
import { inDaytime, localTime, start } from './functions'

/** Only people who chatted within this long, but not in the last hour. */
const ACTIVE_MS = 7 * 24 * HOUR
const JUST_TALKED_MS = HOUR
/** No check-in within this long of a call or another check-in. */
const GAP_MS = 2 * HOUR

/**
 * Who might get a check-in call this hour, with the assistant they last
 * messaged: check-ins on, daytime for them, and no call with that assistant
 * or check-in in the last 2 hours.
 */
// ponytail: the 100 most recent chatters an hour; page through them if that's ever too few.
const candidates = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      userId: v.id('users'),
      projectId: v.id('projects'),
      threadId: v.string(),
      from: v.string(),
      timeZone: v.optional(v.string()),
      lastChatAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const now = Date.now()
    const users = await ctx.db
      .query('users')
      .withIndex('by_lastChat', (q) =>
        q
          .gte('lastChat.at', now - ACTIVE_MS)
          .lt('lastChat.at', now - JUST_TALKED_MS),
      )
      .order('desc')
      .take(100)
    const people = []
    for (const user of users) {
      const last = user.lastChat
      if (!last || user.checkIns === false) continue
      if (inDaytime(now, user.timeZone) !== now) continue
      if (user.checkInAt && now - user.checkInAt < GAP_MS) continue
      const project = await ctx.db.get('projects', last.projectId)
      const bot = last.botId ? await ctx.db.get('bots', last.botId) : null
      const assistant = bot ?? project
      if (!project || !assistant?.threadId) continue
      const call = await ctx.db
        .query('calls')
        .withIndex('by_project_and_bot', (q) =>
          q.eq('projectId', project._id).eq('botId', last.botId),
        )
        .order('desc')
        .first()
      if (call && now - call._creationTime < GAP_MS) continue
      people.push({
        userId: user._id,
        projectId: project._id,
        threadId: assistant.threadId,
        from: assistant.name,
        timeZone: user.timeZone,
        lastChatAt: last.at,
      })
    }
    return people
  },
})

/** Rings the user to check in, within 3 a day. Returns whether it rang. */
const call = internalMutation({
  args: {
    userId: v.id('users'),
    projectId: v.id('projects'),
    threadId: v.string(),
    from: v.string(),
    about: v.union(v.string(), v.null()),
  },
  returns: v.boolean(),
  handler: async (ctx, { userId, about, ...reminder }) => {
    const { ok } = await rateLimiter.limit(ctx, 'checkInCall', { key: userId })
    if (!ok) return false
    const now = Date.now()
    await ctx.db.patch('users', userId, { checkInAt: now })
    const id = await ctx.db.insert('reminders', {
      ...reminder,
      message: about
        ? `Checking in about: ${about.slice(0, 300)}`
        : 'Just checking in to see how things are going.',
      dueAt: now,
      via: 'call',
      kind: 'checkin',
      status: 'scheduled',
    })
    await start(ctx, id, now)
    return true
  },
})

/**
 * Hourly: for each candidate, Jev reads the chat with their assistant and
 * decides whether a call now would be welcome, and about what. It rings at
 * 0.7 or above. One person's failure doesn't stop the rest.
 */
const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const people = await ctx.runQuery(internal.api.checkIns.candidates, {})
    for (const person of people) {
      try {
        const [conversation, openWork] = await Promise.all([
          recentTurns(ctx, person.threadId),
          ctx.runQuery(internal.api.threads.openWork, {
            threadId: person.threadId,
          }),
        ])
        const { callNow, about } = await metered(
          ctx,
          { userId: person.userId, model: MODELS.decide, estimate: 0.005 },
          async () => {
            const { cost, ...result } = await shouldCallNow(decisionModel, {
              conversation: conversation.slice(-10),
              openWork,
              localTime: localTime(Date.now(), person.timeZone),
              hoursSinceLastChat: Math.round(
                (Date.now() - person.lastChatAt) / HOUR,
              ),
            })
            return { result, cost }
          },
        )
        if (callNow < 0.7) continue
        await ctx.runMutation(internal.api.checkIns.call, {
          userId: person.userId,
          projectId: person.projectId,
          threadId: person.threadId,
          from: person.from,
          about,
        })
      } catch (error) {
        console.error(error)
      }
    }
    return null
  },
})

export const checkInsApi = { candidates, call, run }
