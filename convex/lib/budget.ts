import { AIBudget } from '@convex-dev/ai-budget'
import { wrapLanguageModel } from 'ai'
import { ConvexError } from 'convex/values'
import { components } from '../_generated/api'
import { env } from '../_generated/server'
import { chatModel, languageModel } from './ai'
import { MODELS } from './models'
import type { ActionCtx, Id, MutationCtx, QueryCtx } from './ctx'

/** Each person's AI spend a month, in dollars: `AI_BUDGET_USD` on the deployment, or 12. */
export const BUDGET_USD = Number(env.AI_BUDGET_USD) || 12
const NANOS = 1_000_000_000

/**
 * Meters every gateway call per person and refuses one that would pass
 * their month's cap. The deployment's own ceiling is the gateway's spend
 * limit in the Convex dashboard.
 */
export const budget = new AIBudget(components.aiBudget, {
  defaultModel: MODELS.chat,
})

/** Users given this isolate's cap already, so each costs one read. */
const capped = new Set<string>()

/** Gives `userId` the month's cap, once per isolate. Runs before their first metered call. */
export const ensureBudget = async (
  ctx: MutationCtx | ActionCtx,
  userId: Id<'users'>,
) => {
  if (capped.has(userId)) return
  const bucket = await budget.users.get(ctx, { userId })
  if (bucket?.monthlySpendLimitNanos !== BUDGET_USD * NANOS) {
    await budget.users.setLimits(ctx, {
      userId,
      monthlySpendLimitNanos: BUDGET_USD * NANOS,
    })
  }
  capped.add(userId)
}

/** A chat model for `userId`, metered and limit-checked: any id the gateway serves. */
export const budgetedModel = (
  ctx: ActionCtx,
  userId: Id<'users'>,
  model: string,
) => {
  const tracked = budget.languageModel(ctx, { userId, model })
  // The SDK's `LanguageModel` also admits a bare gateway id, which the component never returns.
  if (typeof tracked === 'string') throw new Error('Expected a model object.')
  return wrapLanguageModel({
    model: tracked,
    middleware: {
      wrapGenerate: async ({ doGenerate }) => {
        await ensureBudget(ctx, userId)
        return await doGenerate()
      },
      wrapStream: async ({ doStream }) => {
        await ensureBudget(ctx, userId)
        return await doStream()
      },
    },
  })
}

/**
 * Runs `run`, one gateway call that isn't a chat model (a picture, a
 * transcription, a decision), under `userId`'s budget: `estimate` dollars are
 * held first, then it's charged at the `cost` it returns.
 */
export const metered = async <T>(
  ctx: ActionCtx,
  {
    userId,
    model,
    estimate,
  }: { userId: Id<'users'>; model: string; estimate: number },
  run: () => Promise<{ result: T; cost: number }>,
): Promise<T> => {
  await ensureBudget(ctx, userId)
  let result: T | undefined
  await budget.meter(
    ctx,
    {
      userId,
      model,
      messages: [],
      estimatedCostNanos: Math.round(estimate * NANOS),
    },
    async () => {
      const ran = await run()
      result = ran.result
      return { costNanos: Math.round(ran.cost * NANOS) }
    },
  )
  return result as T
}

/** What `userId` has spent this month, and their cap, in dollars. */
export const budgetOf = async (ctx: QueryCtx, userId: Id<'users'>) => {
  const bucket = await budget.users.get(ctx, { userId })
  return {
    spent: (bucket?.spendThisMonthNanos ?? 0) / NANOS,
    cap: BUDGET_USD,
  }
}

/** The budget's refusal in the user's words, or null when `error` is something else. Looks inside wrapped errors. */
export const budgetMessage = (error: unknown): string | null => {
  if (error instanceof ConvexError) {
    const data = error.data as { kind?: string } | undefined
    if (data?.kind === 'AIBudgetLimit') {
      return `You've used this month's AI budget ($${BUDGET_USD}). It starts over on the 1st.`
    }
  }
  if (error && typeof error === 'object') {
    const { cause, errors, lastError } = error as {
      cause?: unknown
      errors?: Array<unknown>
      lastError?: unknown
    }
    for (const inner of [cause, lastError, ...(errors ?? [])]) {
      const message =
        inner !== undefined && inner !== error ? budgetMessage(inner) : null
      if (message) return message
    }
  }
  return null
}

/** The chat model, unmetered, for code paths that already metered the call. */
export { chatModel, languageModel }
