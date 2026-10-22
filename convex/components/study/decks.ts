import { literals } from 'convex-helpers/validators'
import { ConvexError, v } from 'convex/values'
import { DateTime } from 'luxon'
import { mutation, query } from './_generated/server'
import schema, { vItem } from './schema'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

const MAX_ITEMS = 50

export const vGrade = literals('again', 'hard', 'good', 'easy')
type Grade = 'again' | 'hard' | 'good' | 'easy'

/**
 * The next review for an item graded `grade` at `now`, SM-2 simplified:
 * again comes back in 10 minutes and starts over, hard grows slowly, good
 * goes 1 day, 6 days, then by its ease, and easy goes further.
 */
export const nextReview = (
  item: Pick<Doc<'items'>, 'interval' | 'ease' | 'reps'>,
  grade: Grade,
  now: number,
) => {
  const at = DateTime.fromMillis(now)
  if (grade === 'again') {
    return {
      reps: 0,
      interval: 0,
      ease: Math.max(1.3, item.ease - 0.2),
      due: at.plus({ minutes: 10 }).toMillis(),
    }
  }
  const quality = { hard: 3, good: 4, easy: 5 }[grade]
  const reps = item.reps + 1
  const ease = Math.max(
    1.3,
    item.ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
  )
  const base =
    reps === 1 ? 1 : reps === 2 ? 6 : Math.round(item.interval * ease)
  const interval =
    grade === 'hard'
      ? Math.max(1, Math.round(base * 0.6))
      : grade === 'easy'
        ? Math.round(base * 1.3)
        : base
  return { reps, interval, ease, due: at.plus({ days: interval }).toMillis() }
}

const ownDeck = async (ctx: QueryCtx, userId: string, id: string) => {
  const deckId = ctx.db.normalizeId('decks', id)
  const deck = deckId && (await ctx.db.get('decks', deckId))
  return deck && deck.userId === userId ? deck : null
}

const itemsOf = (ctx: QueryCtx, deckId: Id<'decks'>) =>
  ctx.db
    .query('items')
    .withIndex('by_deck', (q) => q.eq('deckId', deckId))
    .take(MAX_ITEMS)

/** Saves a deck and its items, all due now. */
export const create = mutation({
  args: {
    userId: v.string(),
    projectId: v.string(),
    title: v.string(),
    topic: v.string(),
    format: literals('cards', 'quiz'),
    items: v.array(vItem),
  },
  returns: v.string(),
  handler: async (ctx, { items, ...deck }) => {
    if (items.length === 0 || items.length > MAX_ITEMS) {
      throw new ConvexError(`A deck has 1 to ${MAX_ITEMS} items.`)
    }
    const deckId = await ctx.db.insert('decks', deck)
    const now = Date.now()
    for (const item of items) {
      await ctx.db.insert('items', {
        ...item,
        deckId,
        userId: deck.userId,
        due: now,
        interval: 0,
        ease: 2.5,
        reps: 0,
      })
    }
    return deckId
  },
})

/** A deck with its items. Null when it isn't the user's. */
export const get = query({
  args: { userId: v.string(), id: v.string() },
  returns: v.union(
    v.object({
      deck: schema.doc('decks'),
      items: v.array(schema.doc('items')),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId, id }) => {
    const deck = await ownDeck(ctx, userId, id)
    return deck && { deck, items: await itemsOf(ctx, deck._id) }
  },
})

/** A project's decks, newest first, with how many items are due. */
export const list = query({
  args: { userId: v.string(), projectId: v.string() },
  returns: v.array(v.object({ deck: schema.doc('decks'), due: v.number() })),
  handler: async (ctx, { userId, projectId }) => {
    const decks = await ctx.db
      .query('decks')
      .withIndex('by_user_and_project', (q) =>
        q.eq('userId', userId).eq('projectId', projectId),
      )
      .order('desc')
      .take(50)
    const now = Date.now()
    return await Promise.all(
      decks.map(async (deck) => ({
        deck,
        due: (await itemsOf(ctx, deck._id)).filter((i) => i.due <= now).length,
      })),
    )
  },
})

/** Records how an item went, and schedules its next review. */
export const grade = mutation({
  args: { userId: v.string(), id: v.string(), grade: vGrade },
  returns: v.number(),
  handler: async (ctx, { userId, id, grade: how }) => {
    const itemId = ctx.db.normalizeId('items', id)
    const item = itemId && (await ctx.db.get('items', itemId))
    if (!item || item.userId !== userId) {
      throw new ConvexError('Card not found.')
    }
    const next = nextReview(item, how, Date.now())
    await ctx.db.patch('items', item._id, next)
    return next.due
  },
})

/** Items due for review across a user's decks, soonest first, with their deck's title. */
export const due = query({
  args: { userId: v.string(), limit: v.number() },
  returns: v.array(
    v.object({ item: schema.doc('items'), deck: v.string() }),
  ),
  handler: async (ctx, { userId, limit }) => {
    const items = await ctx.db
      .query('items')
      .withIndex('by_user_and_due', (q) =>
        q.eq('userId', userId).lte('due', Date.now()),
      )
      .take(Math.min(limit, 100))
    return await Promise.all(
      items.map(async (item) => ({
        item,
        deck: (await ctx.db.get('decks', item.deckId))?.title ?? '',
      })),
    )
  },
})

export const remove = mutation({
  args: { userId: v.string(), id: v.string() },
  returns: v.null(),
  handler: async (ctx: MutationCtx, { userId, id }) => {
    const deck = await ownDeck(ctx, userId, id)
    if (!deck) throw new ConvexError('Deck not found.')
    for (const item of await itemsOf(ctx, deck._id)) {
      await ctx.db.delete('items', item._id)
    }
    await ctx.db.delete('decks', deck._id)
    return null
  },
})
