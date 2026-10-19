import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

async function setup() {
  const t = convexTest(schema, modules)
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
  return { t, asAda, asBob: t.withIdentity({ subject: bob }), projectId }
}

const steps = [
  { text: 'Book the venue', done: false },
  { text: 'Send invites', done: false },
]

test('an assistant saves a plan, revises it, and the user ticks steps off', async () => {
  const { t, asAda, projectId } = await setup()
  const planId = await t.mutation(internal.api.plans.write, {
    projectId,
    threadId: 'thread',
    title: 'Party',
    steps,
  })
  await t.mutation(internal.api.plans.write, {
    projectId,
    threadId: 'thread',
    planId,
    title: 'Birthday party',
    steps: [...steps, { text: 'Order cake', done: false }],
  })
  await asAda.mutation(api.api.plans.toggleStep, { id: planId, index: 1 })

  expect(await asAda.query(api.api.plans.list, { projectId })).toMatchObject([
    {
      title: 'Birthday party',
      steps: [
        { text: 'Book the venue', done: false },
        { text: 'Send invites', done: true },
        { text: 'Order cake', done: false },
      ],
    },
  ])
})

test("a revision can't reach another workspace's plan or a made-up id", async () => {
  const { t, asAda, projectId } = await setup()
  const other = await asAda.mutation(api.api.projects.save, {
    name: 'Side',
    brief: '',
    guidelines: '',
  })
  const planId = await t.mutation(internal.api.plans.write, {
    projectId: other,
    threadId: 'thread',
    title: 'Secret',
    steps,
  })
  for (const id of [planId, 'not-an-id']) {
    await expect(
      t.mutation(internal.api.plans.write, {
        projectId,
        threadId: 'thread',
        planId: id,
        title: 'Hijack',
        steps,
      }),
    ).rejects.toThrow('No such plan in this workspace.')
  }
})

test("another user can't see, tick or delete your plans", async () => {
  const { t, asBob, projectId } = await setup()
  const planId = await t.mutation(internal.api.plans.write, {
    projectId,
    threadId: 'thread',
    title: 'Party',
    steps,
  })
  await expect(asBob.query(api.api.plans.list, { projectId })).rejects.toThrow(
    'Project not found.',
  )
  await expect(
    asBob.mutation(api.api.plans.toggleStep, { id: planId, index: 0 }),
  ).rejects.toThrow('Project not found.')
  await expect(
    asBob.mutation(api.api.plans.remove, { id: planId }),
  ).rejects.toThrow('Project not found.')
})
