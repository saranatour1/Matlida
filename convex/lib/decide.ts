import { listMessages } from '@convex-dev/agent'
import { experimental_decide } from 'ai'
import { components } from '../_generated/api'
import { gatewayCost } from '../models/usage/functions'
import type { MessageDoc } from '@convex-dev/agent'
import type { Experimental_DecisionModel } from 'ai'
import type { ActionCtx } from './ctx'

/**
 * Has a decision model (Jev, through the gateway) pick one of `options` for
 * `question`, given `context`. Returns the pick and each option's
 * probability, so a close call shows.
 */
export const decide = async (
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
) => {
  const { answers, providerMetadata } = await experimental_decide({
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
  return { choice, probabilities, cost: gatewayCost(providerMetadata) }
}

/** One message in a chat, as Jev reads it. Tool calls and failures are in `text`. */
export type Turn = { role: 'user' | 'assistant'; text: string }

/** The chat's last 30 messages for Jev, with which tools ran and which failed. */
export const recentTurns = async (ctx: ActionCtx, threadId: string) => {
  const { page } = await listMessages(ctx, components.agent, {
    threadId,
    paginationOpts: { numItems: 30, cursor: null },
  })
  return page
    .sort((a, b) => a.order - b.order || a.stepOrder - b.stepOrder)
    .flatMap((m): Array<Turn> => {
      const text = turnText(m).slice(0, 500)
      if (!text) return []
      return [{ role: m.message?.role === 'user' ? 'user' : 'assistant', text }]
    })
}

const turnText = ({ message, text, status, error }: MessageDoc) => {
  const parts = Array.isArray(message?.content) ? message.content : []
  return [
    text?.trim(),
    ...parts.map((part) =>
      part.type === 'tool-call'
        ? `[used ${part.toolName}]`
        : part.type === 'tool-result' && part.output?.type.startsWith('error')
          ? `[${part.toolName} failed]`
          : '',
    ),
    status === 'failed' ? `[this reply failed: ${error ?? 'no reason'}]` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Whether the assistant still owes the user something from `conversation`:
 * a request it hasn't done or answered, a tool that failed, something it
 * said it would do later, or work in `openWork` that hasn't finished. Jev
 * answers that and which request it is in one call, as two questions.
 */
export const needsFollowUp = async (
  model: Experimental_DecisionModel,
  {
    conversation,
    openWork,
  }: { conversation: Array<Turn>; openWork: Array<string> },
  abortSignal?: AbortSignal,
) => {
  const requests = conversation
    .filter((t) => t.role === 'user')
    .slice(-8)
    .map((t) => t.text)
  const { answers, providerMetadata } = await experimental_decide({
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
  const needs = answers.needs_follow_up.probability >= 0.5
  const index = needs
    ? /^request_(\d+)$/.exec(answers.which.choice)?.[1]
    : undefined
  return {
    needsFollowUp: needs,
    probability: answers.needs_follow_up.probability,
    request: index ? (requests[Number(index) - 1] ?? null) : null,
    openWork,
    cost: gatewayCost(providerMetadata),
  }
}

/** Who should handle a problem: AI alone, AI then a person, or a person. */
export const HANDLERS = {
  ai: 'An AI assistant can handle this well on its own.',
  ai_then_person:
    'An AI assistant can help get it ready, but a real person should decide or do the final part.',
  person:
    'A real person should handle this: a professional like a doctor, lawyer, accountant or therapist, someone the user trusts, or the user themselves.',
}

/**
 * The "make my problems go away" check: who should handle `problem`, and
 * whether getting it wrong could really hurt. Jev answers both in one call.
 */
export const whoShouldHandle = async (
  model: Experimental_DecisionModel,
  { problem, context }: { problem: string; context: string },
  abortSignal?: AbortSignal,
) => {
  const { answers, providerMetadata } = await experimental_decide({
    model,
    state: { problem, context },
    questions: {
      who: {
        type: 'choice',
        instructions:
          'Given `context`, who should handle `problem` for the user to get a good outcome?',
        criteria: HANDLERS,
      },
      risky: {
        type: 'boolean',
        instructions:
          'Could getting `problem` wrong seriously hurt the user’s health, safety, money, legal standing or relationships?',
      },
    },
    abortSignal,
  })
  const { choice } = answers.who
  const probabilities: Partial<Record<string, number>> = answers.who
    .probabilities ?? { [choice]: 1 }
  return {
    verdict: choice,
    probabilities,
    risky: answers.risky.probability >= 0.5,
    cost: gatewayCost(providerMetadata),
  }
}

/** What to do after a reminder call you didn't pick up. `reminders.miss` clamps it. */
export const AFTER_MISSED = {
  call_again_soon:
    'Call again in about 10 minutes: it is time-sensitive, or they were probably away for a moment.',
  call_again_later:
    'Call again in about an hour: it still matters today, but not right now.',
  text_instead:
    'Stop calling and text it: they are likely busy, and they can read it later.',
  leave_in_chat:
    'Stop calling and leave it in the chat: it is minor, or calling again would be a nuisance.',
}

export type AfterMissed = keyof typeof AFTER_MISSED

/**
 * Whether to call again after a missed or declined reminder call, and when,
 * given how many times the assistant has called, the user's local time and
 * the recent chat.
 */
export const afterMissedCall = async (
  model: Experimental_DecisionModel,
  state: {
    reminder: string
    attempts: number
    declined: boolean
    localTime: string
    conversation: Array<Turn>
  },
  abortSignal?: AbortSignal,
) => {
  const { answers, providerMetadata } = await experimental_decide({
    model,
    state,
    questions: {
      next: {
        type: 'choice',
        instructions:
          'The assistant called the user about `reminder` and they did not pick up (`declined` is true when they pressed decline). Given `attempts` calls so far, their `localTime` and the recent `conversation`, what should the assistant do next?',
        criteria: AFTER_MISSED,
      },
    },
    abortSignal,
  })
  return {
    next: answers.next.choice,
    cost: gatewayCost(providerMetadata),
  }
}
