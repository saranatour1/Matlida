import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'
import type { Id } from '../../_generated/dataModel'

async function setup() {
  const t = convexTest(schema, modules)
  const [ada, bob] = await t.run(async (ctx) => [
    await ctx.db.insert('users', {}),
    await ctx.db.insert('users', {}),
  ])
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  const fileCount = () =>
    t.run(
      async (ctx) => (await ctx.db.system.query('_storage').take(100)).length,
    )
  const read = (storageId: Id<'_storage'>) =>
    t.run(async (ctx) => (await ctx.storage.get(storageId))?.text() ?? null)
  return {
    asAda,
    asBob: t.withIdentity({ subject: bob }),
    projectId,
    fileCount,
    read,
  }
}

const standup = {
  name: 'Standup',
  description: 'Run a quick standup.',
  markdown: '# Standup\n\nAsk each bot for its top priority this week.',
}

test('saving stores the markdown in storage, and editing replaces the file', async () => {
  const { asAda, projectId, fileCount, read } = await setup()

  const id = await asAda.action(api.api.commands.save, {
    projectId,
    ...standup,
  })
  const [saved] = await asAda.query(api.api.commands.list, { projectId })
  expect(saved).toMatchObject({ _id: id, name: 'standup' })
  expect(await read(saved.storageId)).toBe(standup.markdown)

  await asAda.action(api.api.commands.save, {
    projectId,
    id,
    ...standup,
    markdown: 'Ask everyone what is blocked.',
  })
  const [edited] = await asAda.query(api.api.commands.list, { projectId })
  expect(await read(edited.storageId)).toBe('Ask everyone what is blocked.')
  expect(await read(saved.storageId)).toBeNull()
  expect(await fileCount()).toBe(1)
})

test("another user can't save a command, and no file is left behind", async () => {
  const { asBob, projectId, fileCount } = await setup()
  await expect(
    asBob.action(api.api.commands.save, { projectId, ...standup }),
  ).rejects.toThrow('Project not found.')
  expect(await fileCount()).toBe(0)
})

test('a name that is not a slug is rejected with its message', async () => {
  const { asAda, projectId } = await setup()
  await expect(
    asAda.action(api.api.commands.save, {
      projectId,
      ...standup,
      name: 'stand up!',
    }),
  ).rejects.toThrow('Use up to 32 letters, numbers and dashes, like standup.')
})

test('removing a command deletes its file', async () => {
  const { asAda, projectId, fileCount } = await setup()
  const id = await asAda.action(api.api.commands.save, {
    projectId,
    ...standup,
  })
  await asAda.mutation(api.api.commands.remove, { id })
  expect(await asAda.query(api.api.commands.list, { projectId })).toEqual([])
  expect(await fileCount()).toBe(0)
})
