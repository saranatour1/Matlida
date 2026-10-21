import { z } from 'zod'

/** TypeSafe's System One API, where Jev answers typed questions about some state. */
const API = 'https://api.typesafe.ai/v1/systemone'

const zChoice = z.object({
  model: z.string(),
  answers: z.object({
    decision: z.object({
      choice: z.string(),
      confidence: z.number(),
      probabilities: z.record(z.string(), z.number()),
    }),
  }),
})

/**
 * Has Jev pick one of `options` for `question`, given `context`. Returns the
 * pick, how sure Jev is (0 to 1, low when the options are close) and each
 * option's probability.
 */
export async function decide(
  apiKey: string,
  {
    question,
    options,
    context,
  }: {
    question: string
    options: Array<{ name: string; description?: string }>
    context: string
  },
) {
  const response = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'jev-latest',
      state: { question, context },
      questions: {
        decision: {
          type: 'choice',
          instructions: `Given \`context\`, which option is the best answer to \`question\`?`,
          criteria: Object.fromEntries(
            options.map((o) => [o.name, o.description ?? null]),
          ),
        },
      },
    }),
  })
  if (!response.ok) throw new Error(`TypeSafe ${response.status}`)
  const { model, answers } = zChoice.parse(await response.json())
  return { model, ...answers.decision }
}
