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

/** One message in a chat, as Jev reads it. Tool calls and failures are in `text`. */
export type Turn = { role: 'user' | 'assistant'; text: string }

/**
 * Whether the assistant still owes the user something from `conversation`:
 * a request it hasn't done or answered, a tool that failed, something it
 * said it would do later, or work in `openWork` that hasn't finished. Jev
 * answers that and which request it is in one call, as two questions.
 */
export async function needsFollowUp(
  model: Experimental_DecisionModel,
  {
    conversation,
    openWork,
  }: { conversation: Array<Turn>; openWork: Array<string> },
  abortSignal?: AbortSignal,
) {
  const requests = conversation
    .filter((t) => t.role === 'user')
    .slice(-8)
    .map((t) => t.text)
  const { answers } = await experimental_decide({
    model,
    state: { conversation, open_work: openWork },
    questions: {
      needs_follow_up: {
        type: 'boolean',
        instructions:
          'Does the assistant still owe the user something from `conversation`: a request it has not done or answered, a tool that failed, something it said it would do later, or work in `open_work` that has not finished?',
        criteria: {
          true: 'Something the user asked for is still not done or answered.',
          false: 'Everything the user asked for is done or answered.',
        },
      },
      which: {
        type: 'choice',
        instructions:
          'Which of the user’s requests in `conversation` is still not done or answered?',
        criteria: {
          ...Object.fromEntries(
            requests.map((text, i) => [`request_${i + 1}`, text]),
          ),
          none: 'Every request is done or answered.',
        },
      },
    },
    abortSignal,
  })
  const index = /^request_(\d+)$/.exec(answers.which.choice)?.[1]
  return {
    needsFollowUp: answers.needs_follow_up.probability >= 0.5,
    probability: answers.needs_follow_up.probability,
    request: index ? (requests[Number(index) - 1] ?? null) : null,
    openWork,
  }
}
