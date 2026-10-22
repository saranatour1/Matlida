import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

test('a project is visible only to its owner', async () => {
  const t = convexTest(schema, modules)
  const [ada, bob] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { name: 'Ada' }),
    await ctx.db.insert('users', { name: 'Bob' }),
  ])
  const asAda = t.withIdentity({ subject: ada })
  const asBob = t.withIdentity({ subject: bob })

  const projectId = await asAda.mutation(api.api.projects.save, {
    name: '  Matilda  ',
    brief: '',
    guidelines: '',
  })

  expect(await asAda.query(api.api.projects.list, {})).toMatchObject([
    { _id: projectId, name: 'Matilda' },
  ])
  expect(await asBob.query(api.api.projects.list, {})).toEqual([])
  expect(await asBob.query(api.api.projects.get, { id: projectId })).toBeNull()
  await expect(
    asBob.mutation(api.api.projects.save, {
      id: projectId,
      name: 'Taken',
      brief: '',
      guidelines: '',
    }),
  ).rejects.toThrow('Project not found.')
})

test('save rejects a blank name with its message', async () => {
  const t = convexTest(schema, modules)
  const ada = await t.run((ctx) => ctx.db.insert('users', {}))
  await expect(
    t.withIdentity({ subject: ada }).mutation(api.api.projects.save, {
      name: '   ',
      brief: '',
      guidelines: '',
    }),
  ).rejects.toThrow('Give the project a name.')
})
