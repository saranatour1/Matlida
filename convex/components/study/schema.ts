import { literals } from 'convex-helpers/validators'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/** One card or question, as the app hands it in. */
export const vItem = v.object({
  /** A flash card, a multiple-choice question, or one answered in your own words. */
  kind: literals('card', 'choice', 'short'),
  front: v.string(),
  /** The answer, or for a choice question, why the right one is right. */
  back: v.string(),
  /** For `choice`: the options, and which one is right. */
  choices: v.optional(v.array(v.string())),
  answer: v.optional(v.number()),
})

/** The app's ids, as strings: the component has no users or projects tables. */
const userId = v.string()

export default defineSchema({
  /** A set of cards or a quiz on one topic, in the format you chose. */
  decks: defineTable({
    userId,
    projectId: v.string(),
    title: v.string(),
    topic: v.string(),
    format: literals('cards', 'quiz'),
  }).index('by_user_and_project', ['userId', 'projectId']),
  /**
   * One card or question, with its spaced-review schedule (SM-2, simplified):
   * `due` is when to see it next, `interval` the days until then, `ease` how
   * fast that grows, `reps` the right answers in a row.
   */
  items: defineTable({
    ...vItem.fields,
    deckId: v.id('decks'),
    userId,
    due: v.number(),
    interval: v.number(),
    ease: v.number(),
    reps: v.number(),
  })
    .index('by_deck', ['deckId'])
    .index('by_user_and_due', ['userId', 'due']),
})
