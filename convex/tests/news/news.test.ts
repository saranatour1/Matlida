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

test('the daily briefing posts at your hour, schedules the next, and stops when you turn it off', async () => {
  const { t, asAda, projectId } = await setup()
  // 05:10 UTC is 9:10am in Dubai.
  vi.useFakeTimers({
    now: Date.parse('2026-10-21T05:10:00Z'),
    toFake: ['Date'],
  })
  const save = (dailyHour?: number) =>
    asAda.mutation(api.api.news.saveSettings, {
      projectId,
      topics: ['World'],
      regions: [],
      perTopic: 2,
      dailyHour,
      timeZone: 'Asia/Dubai',
    })
  const settings = async () => {
    const found = await asAda.query(api.api.news.settings, {})
    if (!found) throw new Error('No settings saved.')
    return found
  }
  /** When the pending briefing goes out, or null when none is scheduled. */
  const scheduledFor = async () => {
    const { job } = await settings()
    const found = job && (await t.run((ctx) => ctx.db.system.get('_scheduled_functions', job)))
    return found && found.state.kind === 'pending' ? found.scheduledTime : null
  }
  await save(9)
  // 9am already passed in Dubai today, so the first one is tomorrow's.
  expect(await scheduledFor()).toBe(Date.parse('2026-10-22T05:00:00Z'))

  await t.action(internal.api.news.sendDaily, { id: (await settings())._id })
  const threadId = await asAda.query(api.api.threads.main, { projectId })
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId: threadId!,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page.map((m) => m.text)).toEqual([
    '**Your news for today**\n\n**World**\n- [Ceasefire holds](https://www.reuters.com/a): Talks resume.',
  ])
  expect((await settings()).lastSentDay).toBe('2026-10-21')
  // One briefing is waiting for tomorrow, never two.
  const pending = await t.run(async (ctx) =>
    (await ctx.db.system.query('_scheduled_functions').take(50)).filter(
      (f) => f.name.includes('sendDaily') && f.state.kind === 'pending',
    ),
  )
  expect(pending).toHaveLength(1)

  // "Only when I ask" cancels it.
  await save(undefined)
  expect(await scheduledFor()).toBeNull()
  vi.useRealTimers()
})
