import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

test('the summary counts outcomes and spreads each score over tenths', async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Ada' }))
  for (const [callNow, outcome] of [
    [0.95, 'called'],
    [0.72, 'called'],
    [0.4, 'no_call'],
    [1, 'over_the_limit'],
  ] as const) {
    await t.mutation(internal.api.judgments.record, {
      userId,
      kind: 'check_in',
      scores: { callNow },
      outcome,
    })
  }
  expect(
    await t.query(internal.api.judgments.summary, { kind: 'check_in' }),
  ).toEqual({
    count: 4,
    outcomes: { called: 2, no_call: 1, over_the_limit: 1 },
    scores: { callNow: [0, 0, 0, 0, 1, 0, 0, 1, 0, 2] },
  })
  expect(
    await t.query(internal.api.judgments.summary, { kind: 'answer' }),
  ).toEqual({ count: 0, outcomes: {}, scores: {} })
})
