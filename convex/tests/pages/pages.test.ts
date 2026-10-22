import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  return {
    languageModel: mockModel({
      content: [{ type: 'text', text: 'Updated the page.' }],
    }),
  }
})

afterEach(() => {
  vi.useRealTimers()
})

const setup = async () => {
  const t = convexTest(schema, modules)
  agentTest.register(t)
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
  const threadId = await t.mutation(internal.api.threads.startMain, {
    projectId,
  })
  return {
    t,
    ada,
    asAda,
    asBob: t.withIdentity({ subject: bob }),
    projectId,
    threadId,
  }
}

const dashboard = {
  title: 'Signups',
  kind: 'dashboard' as const,
  markdown: '## Notes\nFrom the admin panel.',
  metrics: [
    { label: 'Signups', value: 120, change: '+12%', trend: [80, 95, 120] },
  ],
}

test('an assistant writes a page, you edit it, and the assistant reads your edits', async () => {
  const { t, asAda, asBob, projectId, threadId } = await setup()
  const pageId = await t.mutation(internal.api.pages.write, {
    projectId,
    threadId,
    updatedBy: 'Matilda',
    ...dashboard,
  })
  await asAda.mutation(api.api.pages.save, {
    id: pageId,
    title: 'Signups this month',
    markdown: '## Notes\nMy own note.',
  })
  expect(
    await t.query(internal.api.pages.read, { projectId, pageId }),
  ).toMatchObject({
    title: 'Signups this month',
    markdown: '## Notes\nMy own note.',
    updatedBy: 'You',
    metrics: dashboard.metrics,
  })
  expect(await asBob.query(api.api.pages.get, { id: pageId })).toBeNull()
  await expect(
    asBob.mutation(api.api.pages.save, {
      id: pageId,
      title: 'x',
      markdown: '',
    }),
  ).rejects.toThrow('Page not found.')
  await expect(
    t.mutation(internal.api.pages.write, {
      projectId: await asAda.mutation(api.api.projects.save, {
        name: 'Side',
        brief: '',
        guidelines: '',
      }),
      threadId,
      pageId,
      updatedBy: 'Matilda',
      ...dashboard,
    }),
  ).rejects.toThrow('No such page in this workspace.')
})

test('a page kept up to date is updated by the lead once its period is up', async () => {
  const start = Date.now()
  vi.useFakeTimers({ now: start, toFake: ['Date'] })
  const { t, projectId, threadId } = await setup()
  const pageId = await t.mutation(internal.api.pages.write, {
    projectId,
    threadId,
    updatedBy: 'Matilda',
    ...dashboard,
  })
  await t.mutation(internal.api.pages.keepUpdated, {
    projectId,
    pageId,
    every: 'day',
    instructions: 'Refresh the numbers.',
  })
  expect(await t.query(internal.api.pages.due, {})).toEqual([])

  vi.setSystemTime(start + 24 * 60 * 60_000)
  expect((await t.query(internal.api.pages.due, {})).map((p) => p._id)).toEqual(
    [pageId],
  )
  await t.action(internal.api.pages.refreshDue, {})
  expect(await t.query(internal.api.pages.due, {})).toEqual([])
  await expect(
    t.mutation(internal.api.pages.keepUpdated, {
      projectId,
      pageId,
      every: 'week',
    }),
  ).rejects.toThrow('Say in `instructions` what to keep up to date.')
})
