import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api, internal } from '../../_generated/api'
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

test('a new account starts with a workspace led by Matilda', async () => {
  const t = convexTest(schema, modules)
  const userId = await t.mutation(internal.api.users.createUser, {
    provider: { name: 'emailPassword', accountId: 'ada', profile: {} },
  })

  const projects = await t
    .withIdentity({ subject: userId })
    .query(api.api.projects.list, {})
  expect(projects).toMatchObject([{ name: 'Matilda' }])
})
