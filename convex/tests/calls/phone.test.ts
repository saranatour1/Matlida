import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

test('Hang up asks the call to end, and only on your own call', async () => {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  const [ada, bob] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { name: 'Ada' }),
    await ctx.db.insert('users', { name: 'Bob' }),
  ])
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  const threadId = await t.mutation(internal.api.threads.startMain, {
    projectId,
  })
  // The call action is scheduled but never runs here: no call is placed.
  const id = await t.mutation(internal.api.calls.startPhone, {
    projectId,
    threadId,
    from: 'Matilda',
    to: '+14155550123',
    say: 'Hi',
    about: 'A test',
  })
  await expect(
    t
      .withIdentity({ subject: bob })
      .mutation(api.api.calls.hangUpPhone, { id }),
  ).rejects.toThrow()
  await asAda.mutation(api.api.calls.hangUpPhone, { id })
  expect(await asAda.query(api.api.calls.phoneState, { id })).toMatchObject({
    status: 'dialing',
    hangUp: true,
  })
})
