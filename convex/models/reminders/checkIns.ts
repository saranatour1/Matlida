import { HOUR } from '@convex-dev/rate-limiter'
import { v } from 'convex/values'
import { components, internal } from '../../_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import { decisionModel } from '../../lib/ai'
import { metered } from '../../lib/budget'
import { JEV_THRESHOLDS, recentTurns, shouldCallNow } from '../../lib/decide'
import { rateLimiter } from '../../lib/limits'
import { MODELS } from '../../lib/models'
import { inDaytime, localTime, start } from './functions'

/** Not when you chatted in the last hour. */
const JUST_TALKED_MS = HOUR
/** No check-in within this long of a call or another check-in. */
const GAP_MS = 2 * HOUR

/**
 * Whether `userId` might get a check-in call now, with the assistant they
 * last messaged: check-ins on, daytime for them, not chatting right now, and
 * no call with that assistant or check-in in the last 2 hours. Empty or one.
 */
const candidates = internalQuery({
  args: { userId: v.id('users') },
  returns: v.array(
    v.object({
      userId: v.id('users'),
      projectId: v.id('projects'),
      threadId: v.string(),
      from: v.string(),
      timeZone: v.optional(v.string()),
      lastChatAt: v.number(),
      cardsDue: v.number(),
    }),
  ),
  handler: async (ctx, { userId }) => {
    const now = Date.now()
    const recent = await ctx.db
      .query('userActivity')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(1)
    const people = []
    for (const last of recent) {
      if (now - last.at < JUST_TALKED_MS) continue
      if (last.checkInAt && now - last.checkInAt < GAP_MS) continue
      const user = await ctx.db.get('users', last.userId)
      if (!user || user.checkIns === false) continue
      if (inDaytime(now, user.timeZone) !== now) continue
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
      const due = await ctx.runQuery(components.study.decks.due, {
        userId: last.userId,
        limit: 100,
      })
      people.push({
        userId: last.userId,
        projectId: project._id,
        threadId: assistant.threadId,
        from: assistant.name,
        timeZone: user.timeZone,
        lastChatAt: last.at,
        cardsDue: due.length,
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
    /** A review call: it opens with up to 5 due study cards. */
    review: v.boolean(),
  },
  returns: v.boolean(),
  handler: async (ctx, { userId, about, review, ...reminder }) => {
    const { ok } = await rateLimiter.limit(ctx, 'checkInCall', { key: userId })
    if (!ok) return false
    const now = Date.now()
    const activity = await ctx.db
      .query('userActivity')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    if (activity) {
      await ctx.db.patch('userActivity', activity._id, { checkInAt: now })
    }
    const cards = review
      ? await ctx.runQuery(components.study.decks.due, { userId, limit: 5 })
      : []
    const id = await ctx.db.insert('reminders', {
      ...reminder,
      message: cards.length
        ? `Time to review ${cards.length} study ${cards.length === 1 ? 'card' : 'cards'}: ${cards
            .map(({ item }, i) => `${i + 1}) ${item.front.slice(0, 120)}`)
            .join(
              ' ',
            )}. Let's start with the first. Tell me your answer and I'll check it.`
        : about
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
 * Scheduled about 3 hours after you last chat (`noteChat`): Jev reads the
 * chat with your assistant and decides whether a call now would be welcome,
 * and about what. It rings at
 * `JEV_THRESHOLDS.checkInCall` or above, and every answer is kept in
 * `judgments`.
 */
const run = internalAction({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const people = await ctx.runQuery(internal.api.checkIns.candidates, {
      userId,
    })
    for (const person of people) {
      try {
        const [conversation, openWork] = await Promise.all([
          recentTurns(ctx, person.threadId),
          ctx.runQuery(internal.api.threads.openWork, {
            threadId: person.threadId,
          }),
        ])
        const { callNow, about, review } = await metered(
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
              cardsDue: person.cardsDue,
            })
            return { result, cost }
          },
        )
        const wanted = callNow >= JEV_THRESHOLDS.checkInCall
        const rang: boolean =
          wanted &&
          (await ctx.runMutation(internal.api.checkIns.call, {
            userId: person.userId,
            projectId: person.projectId,
            threadId: person.threadId,
            from: person.from,
            about,
            review,
          }))
        await ctx.runMutation(internal.api.judgments.record, {
          userId: person.userId,
          kind: 'check_in',
          scores: { callNow },
          choice: review ? 'review' : about ? 'topic' : 'catch_up',
          outcome: rang ? 'called' : wanted ? 'over_the_limit' : 'no_call',
        })
      } catch (error) {
        console.error(error)
      }
    }
    return null
  },
})

export const checkInsApi = { candidates, call, run }
