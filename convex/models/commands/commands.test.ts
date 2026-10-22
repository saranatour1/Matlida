import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'
import { sweepable } from './functions'
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
    t,
    ada,
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

afterEach(() => {
  vi.useRealTimers()
})

test('saving the same command again changes nothing, new or edited', async () => {
  const { asAda, projectId, fileCount } = await setup()
  const id = await asAda.action(api.api.commands.save, {
    projectId,
    ...standup,
  })
  // A retry after a lost response, then an edit that keeps everything.
  expect(
    await asAda.action(api.api.commands.save, { projectId, ...standup }),
  ).toBe(id)
  const [saved] = await asAda.query(api.api.commands.list, { projectId })
  expect(
    await asAda.action(api.api.commands.save, { projectId, id, ...standup }),
  ).toBe(id)
  const commands = await asAda.query(api.api.commands.list, { projectId })
  expect(commands).toEqual([saved])
  expect(await fileCount()).toBe(1)
})

test("a new command can't take a name that's in use for something else", async () => {
  const { asAda, projectId, fileCount } = await setup()
  await asAda.action(api.api.commands.save, { projectId, ...standup })
  await expect(
    asAda.action(api.api.commands.save, {
      projectId,
      ...standup,
      markdown: 'Something else.',
    }),
  ).rejects.toThrow("There's already a /standup command.")
  expect(await fileCount()).toBe(1)
})

test('replacing by name, as save_command does, adds or replaces, and repeats safely', async () => {
  const { t, ada, asAda, projectId, read } = await setup()
  const write = async (markdown: string, hash: string) =>
    t.mutation(internal.api.commands.write, {
      projectId,
      userId: ada,
      replace: true,
      name: 'checkin',
      description: 'Check in on last night.',
      hash,
      storageId: await t.run((ctx) =>
        ctx.storage.store(new Blob([markdown], { type: 'text/markdown' })),
      ),
    })
  const first = await write('Ask what got done.', 'a')
  expect(await write('Ask what got done.', 'a')).toBe(first)
  expect(await write('Ask what got done, and what is next.', 'b')).toBe(first)
  const commands = await asAda.query(api.api.commands.list, { projectId })
  expect(commands).toHaveLength(1)
  expect(await read(commands[0].storageId)).toBe(
    'Ask what got done, and what is next.',
  )
})

test('removing a command twice is fine', async () => {
  const { asAda, projectId } = await setup()
  const id = await asAda.action(api.api.commands.save, {
    projectId,
    ...standup,
  })
  await asAda.mutation(api.api.commands.remove, { id })
  await asAda.mutation(api.api.commands.remove, { id })
  expect(await asAda.query(api.api.commands.list, { projectId })).toEqual([])
})

test('the sweep deletes files nothing keeps, once they are an hour old', async () => {
  const start = Date.now()
  vi.useFakeTimers({ now: start, toFake: ['Date'] })
  const { t, asAda, projectId, fileCount } = await setup()
  await asAda.action(api.api.commands.save, { projectId, ...standup })
  // convex-test doesn't record a stored blob's type, so it's set by hand.
  const store = (type: string) =>
    t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(['x'], { type }))
      await ctx.db.patch(
        '_storage' as never,
        id as never,
        {
          contentType: type,
        } as never,
      )
      return id
    })
  // Left by a save that stopped before saving the command, and by a call.
  await store('text/markdown')
  await store('audio/wav')
  vi.setSystemTime(start + 30 * 60_000)
  const recent = await store('text/markdown')

  vi.setSystemTime(start + 90 * 60_000)
  expect(await t.mutation(internal.api.commands.sweepFiles, {})).toBe(2)
  expect(await t.mutation(internal.api.commands.sweepFiles, {})).toBe(0)
  expect(await fileCount()).toBe(2)
  vi.setSystemTime(start + 120 * 60_000)
  await t.mutation(internal.api.commands.sweepFiles, {})
  expect(
    await t.run(async (ctx) => (await ctx.storage.get(recent)) === null),
  ).toBe(true)
  expect(await fileCount()).toBe(1)
})

test('the sweep never touches pictures or videos', () => {
  expect(sweepable({ contentType: 'text/markdown' })).toBe(true)
  expect(sweepable({ contentType: 'audio/webm' })).toBe(true)
  expect(sweepable({ contentType: 'image/png' })).toBe(false)
  expect(sweepable({ contentType: 'video/mp4' })).toBe(false)
  expect(sweepable({ contentType: 'application/pdf' })).toBe(false)
  expect(sweepable({})).toBe(false)
})
