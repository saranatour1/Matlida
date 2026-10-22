import { expect, test, vi } from 'vitest'
import { decide, needsFollowUp, whoShouldHandle } from './decide'
import type { Experimental_DecisionModelV4 } from '@ai-sdk/provider'

function jev(answer: {
  choice: string
  probabilities?: Record<string, number>
}) {
  return {
    specificationVersion: 'v4',
    provider: 'convex-gateway',
    modelId: '~typesafe/jev-latest',
    supportedQuestionTypes: ['choice'],
    doDecide: vi.fn(() =>
      Promise.resolve({
        answers: { decision: { type: 'choice' as const, ...answer } },
        warnings: [],
      }),
    ),
  } satisfies Experimental_DecisionModelV4
}

test('decide asks Jev one choice question and returns its pick and odds', async () => {
  const model = jev({
    choice: 'train',
    probabilities: { train: 0.78, flight: 0.22 },
  })
  expect(
    await decide(model, {
      question: 'How should I get to Paris?',
      options: [
        { name: 'train', description: 'Eurostar, 2h20' },
        { name: 'flight' },
      ],
      context: 'Hates airports.',
    }),
  ).toEqual({
    choice: 'train',
    probabilities: { train: 0.78, flight: 0.22 },
  })
  expect(model.doDecide).toHaveBeenCalledWith(
    expect.objectContaining({
      questions: {
        decision: expect.objectContaining({
          type: 'choice',
          criteria: { train: 'Eurostar, 2h20', flight: null },
        }) as unknown,
      },
    }),
  )
  expect(JSON.stringify(model.doDecide.mock.calls[0])).toContain(
    'Hates airports.',
  )
})

test('without probabilities, the pick counts as certain', async () => {
  expect(
    await decide(jev({ choice: 'a' }), {
      question: 'Which?',
      options: [{ name: 'a' }, { name: 'b' }],
      context: '',
    }),
  ).toEqual({ choice: 'a', probabilities: { a: 1 } })
})

test('needs_follow_up asks Jev both questions at once and names the open request', async () => {
  const doDecide = vi.fn(() =>
    Promise.resolve({
      answers: {
        needs_follow_up: { type: 'boolean' as const, probability: 0.91 },
        which: { type: 'choice' as const, choice: 'request_1' },
      },
      warnings: [],
    }),
  )
  const model = {
    specificationVersion: 'v4',
    provider: 'convex-gateway',
    modelId: '~typesafe/jev-latest',
    supportedQuestionTypes: ['boolean', 'choice'],
    doDecide,
  } satisfies Experimental_DecisionModelV4
  const conversation = [
    { role: 'user' as const, text: 'Make me a video of a fox' },
    { role: 'assistant' as const, text: 'On it. [used generate_video]' },
    { role: 'user' as const, text: 'Thanks!' },
  ]
  const openWork = ['A video is still being made: a fox']

  expect(await needsFollowUp(model, { conversation, openWork })).toEqual({
    needsFollowUp: true,
    probability: 0.91,
    request: 'Make me a video of a fox',
    openWork,
  })
  expect(doDecide).toHaveBeenCalledOnce()
  expect(doDecide).toHaveBeenCalledWith(
    expect.objectContaining({
      questions: {
        needs_follow_up: expect.objectContaining({
          type: 'boolean',
        }) as unknown,
        which: expect.objectContaining({
          type: 'choice',
          criteria: {
            request_1: 'Make me a video of a fox',
            request_2: 'Thanks!',
            none: 'Every request is done or answered.',
          },
        }) as unknown,
      },
    }),
  )
})

test('the problem check asks Jev who should handle it and whether it is risky, in one call', async () => {
  const doDecide = vi.fn(() =>
    Promise.resolve({
      answers: {
        who: {
          type: 'choice' as const,
          choice: 'person',
          probabilities: { ai: 0.05, ai_then_person: 0.25, person: 0.7 },
        },
        risky: { type: 'boolean' as const, probability: 0.8 },
      },
      warnings: [],
    }),
  )
  const model = {
    specificationVersion: 'v4',
    provider: 'convex-gateway',
    modelId: '~typesafe/jev-latest',
    supportedQuestionTypes: ['boolean', 'choice'],
    doDecide,
  } satisfies Experimental_DecisionModelV4
  expect(
    await whoShouldHandle(model, {
      problem: 'Should I sign this lease with a weird clause?',
      context: 'First apartment.',
    }),
  ).toEqual({
    verdict: 'person',
    probabilities: { ai: 0.05, ai_then_person: 0.25, person: 0.7 },
    risky: true,
  })
  expect(doDecide).toHaveBeenCalledOnce()
})
