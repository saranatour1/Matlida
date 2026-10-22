import { createTool } from '@convex-dev/agent'
import { z } from 'zod'
import { components } from '../../_generated/api'
import { checkAnswer, makeDeck, zStudySet } from '../study/functions'
import type { Doc } from '../../lib/ctx'

/** Flash cards and quizzes, made in the chat and reviewed on a schedule. */
export const studyTools = (project: Doc<'projects'>) => ({
  make_study_set: createTool({
    description:
      'Make flash cards or a quiz for the user to study, shown as a card in the chat and kept in the Library for spaced review. If they did not say cards or quiz, or how many, ask one short question first. Use beginner unless they say otherwise.',
    inputSchema: zStudySet,
    execute: async (ctx, set) =>
      await makeDeck(ctx, project.ownerId, project._id, set),
  }),
  due_cards: createTool({
    description:
      "The user's study cards that are due for review, up to 5, with their ids. Use it to quiz them, by voice on a review call or in the chat: ask one question at a time, without the answer, and pass what they say to check_answer.",
    inputSchema: z.object({}),
    execute: async (ctx) => {
      const due = await ctx.runQuery(components.study.decks.due, {
        userId: project.ownerId,
        limit: 5,
      })
      return due.map(({ item, deck }) => ({
        id: item._id,
        deck,
        question: item.front,
        choices: item.choices,
      }))
    },
  }),
  check_answer: createTool({
    description:
      "Grade the user's answer to a due study card from due_cards, in their words, and record it for their review schedule. Returns whether it was right and the expected answer: tell them, briefly, then ask the next one.",
    inputSchema: z.object({
      id: z.string().describe('The card id from due_cards.'),
      answer: z
        .string()
        .trim()
        .min(1)
        .max(1000)
        .describe('What the user said or wrote, as they said it.'),
    }),
    execute: async (ctx, { id, answer }) =>
      await checkAnswer(ctx, project.ownerId, id, answer),
  }),
})
