import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api, internal } from '../../_generated/api'
import { BUILT_IN_COMMANDS } from '../../lib/commands'
import schema from '../../schema'
import { modules } from '../../test.setup'

test('the command pills list your own commands first, replacing a built-in of the same name', async () => {
  const t = convexTest(schema, modules)
  const ada = await t.run((ctx) => ctx.db.insert('users', { name: 'Ada' }))
  const projectId = await t
    .withIdentity({ subject: ada })
    .mutation(api.api.projects.save, {
      name: 'Matilda',
      brief: '',
      guidelines: '',
    })
  await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(['Do it.']))
    for (const name of ['standup', 'plan']) {
      await ctx.db.insert('commands', {
        projectId,
        name,
        description: `My ${name}`,
        storageId,
      })
    }
  })
  const commands = await t.query(internal.api.commands.described, {
    projectId,
  })
  expect(commands.slice(0, 2)).toEqual([
    { name: 'plan', description: 'My plan' },
    { name: 'standup', description: 'My standup' },
  ])
  expect(commands.filter((c) => c.name === 'plan')).toHaveLength(1)
  expect(commands).toHaveLength(BUILT_IN_COMMANDS.length + 1)
})
