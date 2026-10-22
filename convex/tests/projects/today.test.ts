import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

const NOW = Date.parse('2026-10-21T08:00:00Z')
const HOUR = 60 * 60_000

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
})
afterEach(() => {
  vi.useRealTimers()
})

test("today has what's due in a day, what waits for you, and lists with things left", async () => {
  const t = convexTest(schema, modules)
  const [ada, bob] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { email: 'ada@example.com' }),
    await ctx.db.insert('users', { email: 'bob@example.com' }),
  ])
  const projectId = await t
    .withIdentity({ subject: ada })
    .mutation(api.api.projects.save, {
      name: 'Matilda',
      brief: '',
      guidelines: '',
    })
  await t.run(async (ctx) => {
    const reminder = {
      projectId,
      threadId: 'thread',
      from: 'Matilda',
      via: 'chat' as const,
    }
    await ctx.db.insert('reminders', {
      ...reminder,
      message: 'Stand-up',
      dueAt: NOW + 2 * HOUR,
      status: 'scheduled',
    })
    await ctx.db.insert('reminders', {
      ...reminder,
      message: 'Next week',
      dueAt: NOW + 7 * 24 * HOUR,
      status: 'scheduled',
    })
    await ctx.db.insert('reminders', {
      ...reminder,
      message: 'Tell Luke about the insurance',
      dueAt: NOW + 30 * HOUR,
      status: 'pending',
    })
    await ctx.db.insert('plans', {
      projectId,
      threadId: 'thread',
      title: 'Shopping list',
      steps: [
        { text: 'Milk', done: true },
        { text: 'Eggs', done: false },
      ],
    })
    await ctx.db.insert('plans', {
      projectId,
      threadId: 'thread',
      title: 'Done and dusted',
      steps: [{ text: 'All of it', done: true }],
    })
    const task = {
      projectId,
      threadId: 'thread',
      kind: 'run_plan' as const,
      steps: [],
    }
    await ctx.db.insert('tasks', {
      ...task,
      title: 'Launch plan',
      status: 'waiting_for_you',
    })
    await ctx.db.insert('tasks', { ...task, title: 'Old plan', status: 'done' })
    const email = { status: 'shown' as const, subject: 'Lunch?' }
    await ctx.db.insert('emails', {
      ...email,
      messageId: 'm1',
      receivedAt: NOW - HOUR,
      userId: ada,
      from: 'sam@example.org',
    })
    await ctx.db.insert('emails', {
      ...email,
      messageId: 'm2',
      receivedAt: NOW - HOUR,
      userId: ada,
      from: 'kim@example.org',
      repliedAt: NOW,
    })
    await ctx.db.insert('emails', {
      ...email,
      messageId: 'm3',
      receivedAt: NOW - HOUR,
      userId: bob,
      from: 'eve@example.org',
    })
    await ctx.db.insert('emails', {
      ...email,
      messageId: 'm4',
      receivedAt: NOW - 5 * 24 * HOUR,
      userId: ada,
      from: 'old@example.org',
    })
  })

  expect(await t.query(internal.api.projects.today, { projectId })).toEqual({
    reminders: [
      {
        message: 'Stand-up',
        dueAt: NOW + 2 * HOUR,
        via: 'chat',
        to: undefined,
      },
    ],
    toConfirm: 1,
    tasks: [{ title: 'Launch plan', status: 'waiting_for_you' }],
    emails: [
      { from: 'sam@example.org', subject: 'Lunch?', receivedAt: NOW - HOUR },
    ],
    lists: [
      {
        planId: expect.any(String) as unknown,
        title: 'Shopping list',
        left: 1,
        next: ['Eggs'],
      },
    ],
  })
})
