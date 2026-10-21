import { afterEach, expect, test, vi } from 'vitest'
import { decide } from './typesafe'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('decide asks Jev one choice question and returns its pick and odds', async () => {
  const fetch = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(
      Response.json({
        model: 'jev-1.13.0',
        answers: {
          decision: {
            type: 'choice',
            choice: 'train',
            confidence: 0.62,
            probabilities: { train: 0.78, flight: 0.22 },
          },
        },
        usage: { input_tokens: 120, output_tokens: 12 },
      }),
    ),
  )
  vi.stubGlobal('fetch', fetch)

  expect(
    await decide('ts_key', {
      question: 'How should I get to Paris?',
      options: [
        { name: 'train', description: 'Eurostar, 2h20' },
        { name: 'flight' },
      ],
      context: 'Hates airports.',
    }),
  ).toEqual({
    model: 'jev-1.13.0',
    choice: 'train',
    confidence: 0.62,
    probabilities: { train: 0.78, flight: 0.22 },
  })
  const [url, init] = fetch.mock.calls[0]
  expect(url).toBe('https://api.typesafe.ai/v1/systemone')
  expect(init?.headers).toMatchObject({ Authorization: 'Bearer ts_key' })
  expect(JSON.parse(init?.body as string)).toMatchObject({
    model: 'jev-latest',
    state: {
      question: 'How should I get to Paris?',
      context: 'Hates airports.',
    },
    questions: {
      decision: {
        type: 'choice',
        criteria: { train: 'Eurostar, 2h20', flight: null },
      },
    },
  })
})

test('decide fails on an error from TypeSafe', async () => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(Response.json({ detail: [] }, { status: 422 })),
  )
  await expect(
    decide('ts_key', {
      question: 'Which?',
      options: [{ name: 'a' }, { name: 'b' }],
      context: '',
    }),
  ).rejects.toThrow('TypeSafe 422')
})
