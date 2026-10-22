import { zid } from 'convex-helpers/server/zod4'
import { generateObject } from 'ai'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { components, internal } from '../../_generated/api'
import { internalQuery } from '../../_generated/server'
import { vGrade } from '../../components/study/decks'
import { decisionModel } from '../../lib/ai'
import { budgetedModel, metered } from '../../lib/budget'
import { gradeAnswer } from '../../lib/decide'
import { authedMutation, authedQuery, zAuthedAction } from '../../lib/functions'
import { MODELS } from '../../lib/models'
import { getOwnedProject } from '../projects/queries'
import type { ActionCtx, Id } from '../../lib/ctx'

/**
 * The study component keeps decks and their review schedule. These check
 * who you are, then hand it your user id; decks are written here, with the
 * chat model.
 */

/** What you choose when making a deck. */
export const zStudySet = z.object({
  topic: z.string().trim().min(2, 'Say what to study.').max(500),
  format: z
    .enum(['cards', 'quiz'])
    .describe('cards: flash cards to flip. quiz: questions to answer.'),
  count: z.number().int().min(3).max(30),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
})

const zWritten = z.object({
  title: z.string().describe('A short title for the deck.'),
  items: z.array(
    z.object({
      kind: z.enum(['card', 'choice', 'short']),
      front: z.string().describe('The card front or the question.'),
      back: z
        .string()
        .describe(
          'The answer. For a choice question, a line on why the right option is right.',
        ),
      choices: z
        .array(z.string())
        .optional()
        .describe('For choice: 3 or 4 options.'),
      answer: z
        .number()
        .int()
        .optional()
        .describe('For choice: the index of the right option, from 0.'),
    }),
  ),
})

/**
 * Writes a deck on `topic` in the format and size you chose, and saves it.
 * A choice question without valid options becomes a short-answer one.
 */
export const makeDeck = async (
  ctx: ActionCtx,
  userId: Id<'users'>,
  projectId: Id<'projects'>,
  { topic, format, count, level }: z.infer<typeof zStudySet>,
) => {
  const { object } = await generateObject({
    model: budgetedModel(ctx, userId, MODELS.chat),
    schema: zWritten,
    system:
      'You write study material: clear, accurate and specific, one idea per item, with short fronts and answers. Never make facts up.',
    prompt:
      format === 'cards'
        ? `Write ${count} flash cards (kind "card") on: ${topic}. Level: ${level}.`
        : `Write a ${count}-question quiz on: ${topic}. Level: ${level}. Mix multiple choice (kind "choice", 3 or 4 options) with a few short-answer questions (kind "short").`,
  })
  const items = object.items.slice(0, count).map((item) => {
    if (format === 'cards') {
      return { kind: 'card' as const, front: item.front, back: item.back }
    }
    const valid =
      item.kind === 'choice' &&
      item.choices &&
      item.choices.length >= 2 &&
      item.answer !== undefined &&
      item.answer >= 0 &&
      item.answer < item.choices.length
    return valid
      ? item
      : { kind: 'short' as const, front: item.front, back: item.back }
  })
  const deckId: string = await ctx.runMutation(components.study.decks.create, {
    userId,
    projectId,
    title: object.title.slice(0, 120) || topic.slice(0, 120),
    topic,
    format,
    items,
  })
  return { deckId, title: object.title, format, count: items.length }
}

/** Your project, for actions: throws when it isn't yours. */
const owned = internalQuery({
  args: { userId: v.id('users'), projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, { userId, projectId }) => {
    await getOwnedProject(ctx, userId, projectId)
    return null
  },
})

/** Makes a deck from the Library's New deck form. */
const make = zAuthedAction({
  args: { projectId: zid('projects'), ...zStudySet.shape },
  handler: async (ctx, { projectId, ...set }) => {
    await ctx.runQuery(internal.api.study.owned, {
      userId: ctx.userId,
      projectId,
    })
    return await makeDeck(ctx, ctx.userId, projectId, set)
  },
})

/** A deck and its items, for its card. Null when it isn't yours. */
const deck = authedQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) =>
    await ctx.runQuery(components.study.decks.get, { userId: ctx.userId, id }),
})

/** A project's decks, with how many items are due. */
const list = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await ctx.runQuery(components.study.decks.list, {
      userId: ctx.userId,
      projectId,
    })
  },
})

/** How a card or question went: again, hard, good or easy. Returns when it's due next. */
const grade = authedMutation({
  args: { id: v.string(), grade: vGrade },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.study.decks.grade, {
      userId: ctx.userId,
      ...args,
    }),
})

/** Grades a short answer with Jev, and records it: good when right, again when not. */
const check = zAuthedAction({
  args: {
    deckId: z.string(),
    itemId: z.string(),
    answer: z.string().trim().min(1, 'Write an answer.').max(1000),
  },
  handler: async (ctx, { deckId, itemId, answer }) => {
    const found = await ctx.runQuery(components.study.decks.get, {
      userId: ctx.userId,
      id: deckId,
    })
    const item = found?.items.find((i) => i._id === itemId)
    if (!item) throw new ConvexError('Question not found.')
    const { correct: right, probability } = await metered(
      ctx,
      { userId: ctx.userId, model: MODELS.decide, estimate: 0.005 },
      async () => {
        const { cost, ...result } = await gradeAnswer(decisionModel, {
          question: item.front,
          expected: item.back,
          answer,
        })
        return { result, cost }
      },
    )
    await ctx.runMutation(internal.api.judgments.record, {
      userId: ctx.userId,
      kind: 'answer',
      scores: { correct: probability },
      outcome: right ? 'right' : 'wrong',
    })
    await ctx.runMutation(components.study.decks.grade, {
      userId: ctx.userId,
      id: itemId,
      grade: right ? 'good' : 'again',
    })
    return { correct: right, expected: item.back }
  },
})

const remove = authedMutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) =>
    await ctx.runMutation(components.study.decks.remove, {
      userId: ctx.userId,
      id,
    }),
})

export const studyApi = { owned, make, deck, list, grade, check, remove }
