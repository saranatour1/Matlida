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

test('add_to_list keeps one list per name, grouped by section, and you tick and clear it', async () => {
  const { t, asAda, asBob, projectId } = await setup()
  const add = (
    title: string,
    items: Array<{ text: string; section?: string }>,
  ) =>
    t.mutation(internal.api.plans.addItems, {
      projectId,
      threadId: 'thread',
      title,
      items,
    })
  const listId = await add('Shopping list', [
    { text: '2 lemons', section: 'Produce' },
  ])
  expect(
    await add('shopping list', [{ text: 'Milk', section: 'Dairy & eggs' }]),
  ).toBe(listId)
  const todo = await add('To-do', [{ text: 'Call the dentist' }])
  expect(todo).not.toBe(listId)

  await asAda.mutation(api.api.plans.toggleStep, { id: listId, index: 0 })
  expect(await asAda.query(api.api.plans.get, { id: listId })).toMatchObject({
    title: 'Shopping list',
    steps: [
      { text: '2 lemons', section: 'Produce', done: true },
      { text: 'Milk', section: 'Dairy & eggs', done: false },
    ],
  })
  await asAda.mutation(api.api.plans.clearDone, { id: listId })
  expect(
    (await asAda.query(api.api.plans.get, { id: listId }))?.steps,
  ).toMatchObject([{ text: 'Milk' }])

  expect(await asBob.query(api.api.plans.get, { id: listId })).toBeNull()
  expect(await asAda.query(api.api.plans.get, { id: 'not-an-id' })).toBeNull()
  await expect(
    asBob.mutation(api.api.plans.clearDone, { id: listId }),
  ).rejects.toThrow()
})

test("a card's Add to shopping list adds to your list, and only in your workspace", async () => {
  const { asAda, asBob, projectId } = await setup()
  const id = await asAda.mutation(api.api.plans.addToYourList, {
    projectId,
    threadId: 'thread',
    title: 'Shopping list',
    items: [{ text: '200 g pasta', section: 'Pasta al limone' }],
  })
  expect(await asAda.query(api.api.plans.get, { id })).toMatchObject({
    steps: [{ text: '200 g pasta', section: 'Pasta al limone', done: false }],
  })
  await expect(
    asBob.mutation(api.api.plans.addToYourList, {
      projectId,
      threadId: 'thread',
      title: 'Shopping list',
      items: [{ text: 'Cake' }],
    }),
  ).rejects.toThrow('Project not found.')
})
