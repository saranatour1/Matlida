import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  return {
    searchModel: mockModel({
      content: [
        {
          type: 'text',
          text: '[{"headline": "Ceasefire holds", "summary": "Talks resume.", "url": "https://www.reuters.com/a"}]',
        },
      ],
    }),
  }
})

afterEach(() => {
  vi.useRealTimers()
})

async function setup() {
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
  return { t, asAda, asBob: t.withIdentity({ subject: bob }), projectId }
}

test('you choose what you follow, in your own workspace only', async () => {
  const { asAda, asBob, projectId } = await setup()
  await asAda.mutation(api.api.news.saveSettings, {
    projectId,
    topics: ['World', ' Tech '],
    regions: ['Jordan'],
    avoid: '',
    perTopic: 3,
    timeZone: 'Asia/Amman',
  })
  expect(await asAda.query(api.api.news.settings, {})).toMatchObject({
    topics: ['World', 'Tech'],
    regions: ['Jordan'],
    perTopic: 3,
  })
  expect((await asAda.query(api.api.news.settings, {}))?.avoid).toBeUndefined()
  expect(await asBob.query(api.api.news.settings, {})).toBeNull()
  await expect(
    asBob.mutation(api.api.news.saveSettings, {
      projectId,
      topics: ['World'],
      regions: [],
      perTopic: 3,
    }),
  ).rejects.toThrow('Project not found.')
  await expect(
    asAda.mutation(api.api.news.saveSettings, {
      projectId,
      topics: [],
      regions: [],
      perTopic: 3,
    }),
  ).rejects.toThrow('Pick at least one topic.')
})

test("the daily briefing posts in the lead's chat at your hour, once a day", async () => {
  const { t, asAda, projectId } = await setup()
  // 05:00 UTC is 9am in Dubai.
  vi.useFakeTimers({ now: Date.parse('2026-10-21T05:10:00Z') })
  await asAda.mutation(api.api.news.saveSettings, {
    projectId,
    topics: ['World'],
    regions: [],
    perTopic: 2,
    dailyHour: 9,
    timeZone: 'Asia/Dubai',
  })
  vi.useRealTimers()
  vi.useFakeTimers({
    now: Date.parse('2026-10-21T05:10:00Z'),
    toFake: ['Date'],
  })
  await t.action(internal.api.news.sendDaily, {})
  await t.action(internal.api.news.sendDaily, {})

  const threadId = await asAda.query(api.api.threads.main, { projectId })
  expect(threadId).toBeTruthy()
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId: threadId!,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page.map((m) => m.text)).toEqual([
    '**Your news for today**\n\n**World**\n- [Ceasefire holds](https://www.reuters.com/a): Talks resume.',
  ])
  expect((await asAda.query(api.api.news.settings, {}))?.lastSentDay).toBe(
    '2026-10-21',
  )
})
