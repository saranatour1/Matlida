import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

// The call action is scheduled but never runs here: no call is placed.
test('a call records who placed it, who asked and why, and hangs up on request', async () => {
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
  const ivy = await t.run((ctx) =>
    ctx.db.insert('bots', {
      projectId,
      name: 'Ivy',
      role: '',
      instructions: '',
    }),
  )
  const threadId = await t.mutation(internal.api.threads.startMain, {
    projectId,
  })
  const id = await t.mutation(internal.api.calls.startPhone, {
    projectId,
    threadId,
    from: 'Ivy',
    to: '+14155550123',
    say: 'Hi',
    about: 'Dinner at 8',
  })
  expect(await t.run((ctx) => ctx.db.get('calls', id))).toMatchObject({
    botId: ivy,
    phone: { askedBy: ada, about: 'Dinner at 8', to: '+14155550123' },
  })
  const [listed] = await asAda.query(api.api.calls.history, {
    projectId,
    botId: ivy,
  })
  expect(listed._id).toBe(id)
  expect(await t.query(internal.api.calls.dump, { id })).toMatch(
    /^Ivy called …0123 for you, .*\nAbout: Dinner at 8/,
  )

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
