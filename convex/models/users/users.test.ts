import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

test('current rejects anonymous callers and returns the signed-in user', async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Ada' }))

  await expect(t.query(api.api.users.current, {})).rejects.toThrow(
    'Sign in first.',
  )
  const user = await t
    .withIdentity({ subject: userId })
    .query(api.api.users.current, {})
  expect(user?.name).toBe('Ada')
})
