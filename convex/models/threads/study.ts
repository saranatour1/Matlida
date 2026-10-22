import { createTool } from '@convex-dev/agent'
import { makeDeck, zStudySet } from '../study/functions'
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
})
