/** `lib/budget` for tests: no caps and no metering, on the mocked models. */
import * as ai from './lib/ai'
import { MODELS } from './lib/models'
import type { LanguageModel } from 'ai'

/** An export of the test's `lib/ai` mock, or undefined when the mock leaves it out. */
const exported = (name: string): unknown => {
  try {
    return (ai as unknown as Record<string, unknown>)[name]
  } catch {
    return undefined
  }
}

/** The mocked model for a job's id (`searchModel` for the search model), else `chatModel(id)`. */
export const budgetedModel = (
  _ctx: unknown,
  _userId: unknown,
  model: string,
) => {
  const job = (Object.keys(MODELS) as Array<keyof typeof MODELS>).find(
    (j) => MODELS[j] === model,
  )
  const named =
    job && exported(job === 'chat' ? 'languageModel' : `${job}Model`)
  if (named) return named as LanguageModel
  const chatModel = exported('chatModel') as
    ((id: string) => LanguageModel) | undefined
  return chatModel
    ? chatModel(model)
    : (exported('languageModel') as LanguageModel)
}
export const metered = async <T>(
  _ctx: unknown,
  _opts: unknown,
  run: () => Promise<{ result: T; cost: number }>,
) => (await run()).result
export const ensureBudget = () => Promise.resolve()
export const budgetOf = () => Promise.resolve({ spent: 0, cap: 12 })
export const budgetMessage = () => null
export const BUDGET_USD = 12
