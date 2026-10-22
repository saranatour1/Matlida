import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

const setup = async () => {
  const t = convexTest(schema, modules)
  const [ada, bob] = await t.run(async (ctx) => [
    await ctx.db.insert('users', {}),
    await ctx.db.insert('users', {}),
  ])
  const asAda = t.withIdentity({ subject: ada })
  const asBob = t.withIdentity({ subject: bob })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  const ivy = await asAda.mutation(api.api.bots.save, {
    projectId,
    name: 'Ivy',
    role: 'Researcher',
    instructions: 'You dig into questions. Never guess.',
  })
  return { t, asAda, asBob, projectId, ivy }
}

test('notes are left on a passage, listed, resolved and removed', async () => {
  const { asAda, projectId, ivy } = await setup()
  const target = { projectId, kind: 'bot' as const, targetId: ivy }
  const id = await asAda.mutation(api.api.comments.add, {
    ...target,
    quote: 'Never guess.',
    text: 'Say what to do instead: ask a question.',
  })
  expect(await asAda.query(api.api.comments.list, target)).toMatchObject([
    { quote: 'Never guess.', resolved: false },
  ])
  await asAda.mutation(api.api.comments.setResolved, { id, resolved: true })
  expect(await asAda.query(api.api.comments.list, target)).toMatchObject([
    { resolved: true },
  ])
  await asAda.mutation(api.api.comments.remove, { id })
  expect(await asAda.query(api.api.comments.list, target)).toEqual([])
})

test('the workspace guidelines take notes under the project’s own id', async () => {
  const { asAda, projectId } = await setup()
  const target = { projectId, kind: 'project' as const, targetId: projectId }
  await asAda.mutation(api.api.comments.add, {
    ...target,
    quote: 'Be brief.',
    text: 'Define brief.',
  })
  expect(await asAda.query(api.api.comments.list, target)).toHaveLength(1)
})

test('a note needs a quote and a text, and a target in this workspace', async () => {
  const { asAda, asBob, projectId, ivy } = await setup()
  await expect(
    asAda.mutation(api.api.comments.add, {
      projectId,
      kind: 'bot',
      targetId: ivy,
      quote: '  ',
      text: 'x',
    }),
  ).rejects.toThrow('Select the text the note is about.')
  const theirs = await asBob.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  await expect(
    asBob.mutation(api.api.comments.add, {
      projectId: theirs,
      kind: 'bot',
      targetId: ivy,
      quote: 'Never guess.',
      text: 'Mine now?',
    }),
  ).rejects.toThrow('Not in this workspace.')
  await expect(
    asBob.query(api.api.comments.list, {
      projectId,
      kind: 'bot',
      targetId: ivy,
    }),
  ).rejects.toThrow('Project not found.')
})

test('removing a bot removes its notes', async () => {
  const { t, asAda, projectId, ivy } = await setup()
  await asAda.mutation(api.api.comments.add, {
    projectId,
    kind: 'bot',
    targetId: ivy,
    quote: 'Never guess.',
    text: 'Why?',
  })
  await asAda.mutation(api.api.bots.remove, { id: ivy })
  expect(await t.run((ctx) => ctx.db.query('comments').take(10))).toEqual([])
})
