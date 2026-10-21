import { experimental_decide } from 'ai'
import type { Experimental_DecisionModel } from 'ai'

/**
 * Has a decision model (Jev, through the gateway) pick one of `options` for
 * `question`, given `context`. Returns the pick and each option's
 * probability, so a close call shows.
 */
export async function decide(
  model: Experimental_DecisionModel,
  {
    question,
    options,
    context,
  }: {
    question: string
    options: Array<{ name: string; description?: string }>
    context: string
  },
  abortSignal?: AbortSignal,
) {
  const { answers } = await experimental_decide({
    model,
    state: { question, context },
    questions: {
      decision: {
        type: 'choice',
        instructions:
          'Given `context`, which option is the best answer to `question`?',
        criteria: Object.fromEntries(
          options.map((o) => [o.name, o.description ?? null]),
        ),
      },
    },
    abortSignal,
  })
  const { choice, probabilities = { [choice]: 1 } } = answers.decision
  return { choice, probabilities }
}
