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

/**
 * Where code acts on Jev's probabilities. Starting points, not measured yet:
 * every answer is kept in `judgments`, so check `judgments.summary` before
 * moving one.
 */
export const JEV_THRESHOLDS = {
  /** Below this "still needed", a recurring reminder stops. */
  stopRecurring: 0.3,
  /** At least this sure before a recurring reminder goes out another way. */
  switchChannel: 0.7,
  /** At least this for a check-in call. */
  checkInCall: 0.7,
  /** At least this for a study answer to count as right. */
  correctAnswer: 0.5,
  /** At least this sure a phone call is over before hanging up. */
  hangUp: 0.7,
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
  const { choice, probabilities } = answers.next
  return {
    next: choice,
    probability: probabilities?.[choice] ?? 1,
    cost: gatewayCost(providerMetadata),
  }
}

/** How often a reminder happens. `reminders.schedule` turns all but `once` into a cron. */
export const HOW_OFTEN = {
  once: 'Just once, at the time given.',
  daily: 'Every day at that time.',
  weekdays: 'Every weekday, Monday to Friday, at that time.',
  weekly: 'Every week, on that day and time.',
  monthly: 'Every month, on that date and time.',
  custom:
    'Recurring on another pattern, like every Tuesday and Thursday, or twice a day.',
}

export type HowOften = keyof typeof HOW_OFTEN

/** Whether the reminder the user asked for (`request`) happens once or recurs, and how often. */
export const howOften = async (
  model: Experimental_DecisionModel,
  state: { request: string; reminder: string },
  abortSignal?: AbortSignal,
) => {
  const { answers, providerMetadata } = await experimental_decide({
    model,
    state,
    questions: {
      repeat: {
        type: 'choice',
        instructions:
          'The user asked for a reminder in `request`, saved as `reminder`. Should it happen once, or keep recurring, and how often?',
        criteria: HOW_OFTEN,
      },
    },
    abortSignal,
  })
  return { repeat: answers.repeat.choice, cost: gatewayCost(providerMetadata) }
}

/** What to do with a recurring reminder that's due. */
export const RECURRING_ACTIONS = {
  deliver: 'Remind them as usual.',
  skip_once:
    'Skip this time: they already did it today, or said they would without a reminder.',
  pause:
    'Pause it until they say otherwise: they are away, sick, or asked for a break from it.',
  notify_differently:
    'Remind them, but another way than usual would reach them better right now.',
}

const CHANNELS = {
  chat: 'A message in the app.',
  text: 'A text message.',
  call: 'A call in the app.',
  email: 'An email.',
}

/**
 * Before a recurring reminder goes out: whether it's still needed at all,
 * what to do this time, and which way would reach the user best. Jev
 * answers all three in one call; `reminders.fire` applies the thresholds.
 */
export const checkRecurring = async (
  model: Experimental_DecisionModel,
  state: {
    reminder: string
    via: keyof typeof CHANNELS
    localTime: string
    conversation: Array<Turn>
  },
  abortSignal?: AbortSignal,
) => {
  const { answers, providerMetadata } = await experimental_decide({
    model,
    state,
    questions: {
      still_needed: {
        type: 'boolean',
        instructions:
          'Given `conversation`, does the user still need the recurring reminder `reminder`? No when they said it is done for good, no longer relevant, or asked to stop it.',
      },
      action: {
        type: 'choice',
        instructions:
          'The recurring reminder `reminder` is due now, at `localTime`. Given `conversation`, what should the assistant do with it this time?',
        criteria: RECURRING_ACTIONS,
      },
      channel: {
        type: 'choice',
        instructions:
          'The reminder usually goes out by `via`. Given `localTime` and `conversation`, which way would reach the user best right now?',
        criteria: CHANNELS,
      },
    },
    abortSignal,
  })
  const { choice, probabilities } = answers.channel
  return {
    stillNeeded: answers.still_needed.probability,
    action: answers.action.choice,
    channel: choice,
    channelProbability: probabilities?.[choice] ?? 1,
    cost: gatewayCost(providerMetadata),
  }
}

/**
 * Whether the assistant should call the user now just to check in, and
 * about what: one of their recent requests, work still running, or nothing
 * in particular. `checkIns.run` acts at `JEV_THRESHOLDS.checkInCall`, within its limits.
 */
export const shouldCallNow = async (
  model: Experimental_DecisionModel,
  {
    conversation,
    openWork,
    localTime,
    hoursSinceLastChat,
    cardsDue = 0,
  }: {
    conversation: Array<Turn>
    openWork: Array<string>
    localTime: string
    hoursSinceLastChat: number
    /** Study cards due for review, which a call can quiz them on. */
    cardsDue?: number
  },
  abortSignal?: AbortSignal,
) => {
  const topics = [
    ...conversation
      .filter((t) => t.role === 'user')
      .slice(-5)
      .map((t) => t.text),
    ...openWork,
  ]
  const { answers, providerMetadata } = await experimental_decide({
    model,
    state: {
      conversation,
      open_work: openWork,
      local_time: localTime,
      hours_since_last_chat: hoursSinceLastChat,
      study_cards_due: cardsDue,
    },
    questions: {
      call_now: {
        type: 'boolean',
        instructions:
          'Would a short call from the assistant right now be welcome and useful to the user? Yes when something in `conversation` or `open_work` is still owed, unfinished or worth checking on, or several `study_cards_due` are waiting to be reviewed, and `local_time` and `hours_since_last_chat` make a call reasonable. No when nothing is pending, they just talked, or a call would feel intrusive.',
      },
      about: {
        type: 'choice',
        instructions:
          'If the assistant calls now, what is the most useful thing to check in about?',
        criteria: {
          ...Object.fromEntries(
            topics.map((text, i) => [`topic_${i + 1}`, text]),
          ),
          ...(cardsDue > 0 && {
            review: `Quizzing them on the ${cardsDue} study cards due for review.`,
          }),
          catch_up:
            'Nothing specific: a friendly check-in on how things are going.',
        },
      },
    },
    abortSignal,
  })
  const index = /^topic_(\d+)$/.exec(answers.about.choice)?.[1]
  return {
    callNow: answers.call_now.probability,
    about: index ? (topics[Number(index) - 1] ?? null) : null,
    review: answers.about.choice === 'review',
    cost: gatewayCost(providerMetadata),
  }
}

/**
 * Whether a phone call the assistant placed has done its job and should end
 * now. In `conversation`, `user` is the person called. The call hangs up at
 * `JEV_THRESHOLDS.hangUp`.
 */
export const callIsOver = async (
  model: Experimental_DecisionModel,
  { about, conversation }: { about: string; conversation: Array<Turn> },
  abortSignal?: AbortSignal,
) => {
  const { answers, providerMetadata } = await experimental_decide({
    model,
    state: { call_purpose: about, conversation },
    questions: {
      over: {
        type: 'boolean',
        instructions:
          'The assistant phoned someone for `call_purpose`. Should it say goodbye and hang up now? Yes when the purpose is done (the message was delivered and acknowledged, or the question answered) and the person has nothing more to ask, or when they are wrapping up, saying bye or asking to end the call. No while they are still asking or telling something, or the purpose is not done yet.',
      },
    },
    abortSignal,
  })
  return { over: answers.over.probability, cost: gatewayCost(providerMetadata) }
}

/** Whether a short answer to a study question is right, given the expected one. Right at `JEV_THRESHOLDS.correctAnswer`. */
export const gradeAnswer = async (
  model: Experimental_DecisionModel,
  state: { question: string; expected: string; answer: string },
  abortSignal?: AbortSignal,
) => {
  const { answers, providerMetadata } = await experimental_decide({
    model,
    state,
    questions: {
      correct: {
        type: 'boolean',
        instructions:
          'Is `answer` a correct answer to `question`, given the expected answer `expected`? Accept different wording, spelling slips and extra detail that is still true. Reject answers that are wrong, missing the key point, or only partly right.',
      },
    },
    abortSignal,
  })
  const { probability } = answers.correct
  return {
    correct: probability >= JEV_THRESHOLDS.correctAnswer,
    probability,
    cost: gatewayCost(providerMetadata),
  }
}
