import { convexTest } from 'convex-test'
import { expect, test, vi } from 'vitest'
import { api } from '../../_generated/api'
import { languageModel } from '../../lib/ai'
import schema from '../../schema'
import { modules } from '../../test.setup'

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  return {
    languageModel: mockModel({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            name: 'Weekly Update!',
            description: 'Writes the team a weekly update.',
            markdown:
              '  Write a short weekly update: shipped, next, risks. Use web_search for anything public.  ',
          }),
        },
      ],
    }),
  }
})

const calls = (languageModel as unknown as { doGenerateCalls: Array<unknown> })
  .doGenerateCalls

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
  return { t, asAda, asBob: t.withIdentity({ subject: bob }), projectId }
}

test('AI writes a command to check, with a usable name, and saves nothing', async () => {
  const { asAda, projectId } = await setup()
  const draft = await asAda.action(api.api.commands.draft, {
    projectId,
    idea: 'A weekly update for the team',
  })
  expect(draft).toEqual({
    name: 'weekly-update',
    description: 'Writes the team a weekly update.',
    markdown:
      'Write a short weekly update: shipped, next, risks. Use web_search for anything public.',
  })
  expect(JSON.stringify(calls.at(-1))).toContain('A weekly update for the team')
  expect(await asAda.query(api.api.commands.list, { projectId })).toEqual([])
})

test('a name already taken gets a number', async () => {
  const { asAda, projectId } = await setup()
  await asAda.action(api.api.commands.save, {
    projectId,
    name: 'weekly-update',
    description: 'Mine',
    markdown: 'Mine.',
  })
  const draft = await asAda.action(api.api.commands.draft, {
    projectId,
    idea: 'A weekly update for the team',
  })
  expect(draft.name).toBe('weekly-update-2')
})

test("only the workspace's owner can draft its commands", async () => {
  const { asBob, projectId } = await setup()
  await expect(
    asBob.action(api.api.commands.draft, { projectId, idea: 'Anything' }),
  ).rejects.toThrow('Project not found.')
})
