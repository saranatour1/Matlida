import { expect, test, vi } from 'vitest'
import { decide } from './decide'
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
