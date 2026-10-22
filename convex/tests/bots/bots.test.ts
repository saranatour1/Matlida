import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

const ivy = {
  name: 'Ivy',
  role: 'Researcher',
  instructions: 'You dig into questions and summarize what matters.',
}

const setup = async () => {
  const t = convexTest(schema, modules)
  const [ada, bob] = await t.run(async (ctx) => [
    await ctx.db.insert('users', {}),
    await ctx.db.insert('users', {}),
  ])
  const asAda = t.withIdentity({ subject: ada })
  const newProject = (name: string) =>
    asAda.mutation(api.api.projects.save, { name, brief: '', guidelines: '' })
  return { asAda, asBob: t.withIdentity({ subject: bob }), newProject }
}

test("only the owner can add, list and remove a project's bots", async () => {
  const { asAda, asBob, newProject } = await setup()
  const projectId = await newProject('Matilda')

  const id = await asAda.mutation(api.api.bots.save, { projectId, ...ivy })
  expect(await asAda.query(api.api.bots.list, { projectId })).toMatchObject([
    { _id: id, ...ivy },
  ])

  await expect(asBob.query(api.api.bots.list, { projectId })).rejects.toThrow(
    'Project not found.',
  )
  await expect(
    asBob.mutation(api.api.bots.save, { projectId, ...ivy, name: 'Spy' }),
  ).rejects.toThrow('Project not found.')
  await expect(asBob.mutation(api.api.bots.remove, { id })).rejects.toThrow(
    'Project not found.',
  )

  await asAda.mutation(api.api.bots.remove, { id })
  expect(await asAda.query(api.api.bots.list, { projectId })).toEqual([])
})

test('a second bot with the same name is rejected', async () => {
  const { asAda, newProject } = await setup()
  const projectId = await newProject('Matilda')
  await asAda.mutation(api.api.bots.save, { projectId, ...ivy })
  await expect(
    asAda.mutation(api.api.bots.save, { projectId, ...ivy, role: 'Writer' }),
  ).rejects.toThrow("There's already a bot named Ivy.")
})

test('bots from your other projects are offered as templates', async () => {
  const { asAda, newProject } = await setup()
  const matilda = await newProject('Matilda')
  const research = await newProject('Research')
  await asAda.mutation(api.api.bots.save, { projectId: research, ...ivy })

  expect(
    await asAda.query(api.api.bots.fromOtherProjects, { projectId: matilda }),
  ).toMatchObject([{ ...ivy, projectName: 'Research' }])
  expect(
    await asAda.query(api.api.bots.fromOtherProjects, { projectId: research }),
  ).toEqual([])
})

test('a bot made from just a name and a portrait gets a starter role and instructions', async () => {
  const { asAda, newProject } = await setup()
  const projectId = await newProject('Matilda')
  await asAda.mutation(api.api.bots.save, {
    projectId,
    name: 'Rex',
    role: '',
    instructions: '',
    portrait: 'frog',
  })

  expect(await asAda.query(api.api.bots.list, { projectId })).toMatchObject([
    { name: 'Rex', role: 'Assistant', portrait: 'frog' },
  ])
})

test('copying a bot adds a numbered copy with the same instructions and portrait', async () => {
  const { asAda, asBob, newProject } = await setup()
  const projectId = await newProject('Matilda')
  const id = await asAda.mutation(api.api.bots.save, {
    projectId,
    ...ivy,
    portrait: 'fox',
  })

  await asAda.mutation(api.api.bots.duplicate, { id })
  await asAda.mutation(api.api.bots.duplicate, { id })

  const bots = await asAda.query(api.api.bots.list, { projectId })
  expect(bots.map((b) => b.name).sort()).toEqual([
    'Ivy',
    'Ivy copy',
    'Ivy copy 2',
  ])
  expect(bots.every((b) => b.instructions === ivy.instructions)).toBe(true)
  expect(bots.every((b) => b.portrait === 'fox')).toBe(true)
  await expect(asBob.mutation(api.api.bots.duplicate, { id })).rejects.toThrow(
    'Project not found.',
  )
})
