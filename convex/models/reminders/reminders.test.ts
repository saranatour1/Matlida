import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

async function setup() {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  const ada = await t.run((ctx) => ctx.db.insert('users', { name: 'Ada' }))
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  const threadId = await t.run(async (ctx) => {
    const { createThread } = await import('@convex-dev/agent')
    const { components } = await import('../../_generated/api')
    const id = await createThread(ctx, components.agent, { userId: ada })
    await ctx.db.insert('threads', {
      projectId,
      threadId: id,
      kind: 'chat',
      title: 'Chat',
    })
    return id
  })
  return { t, asAda, projectId, threadId }
}

const HOUR = 60 * 60 * 1000

test('a due call reminder falls back to the chat when calls and texting are off', async () => {
  const { t, asAda, projectId, threadId } = await setup()
  await t.mutation(internal.api.reminders.schedule, {
    projectId,
    threadId,
    from: 'Matilda',
    message: 'Call the bank',
    dueAt: Date.now() + HOUR,
    via: 'call',
  })
  expect(await asAda.query(api.api.reminders.list, { projectId })).toHaveLength(
    1,
  )

  await t.finishAllScheduledFunctions(vi.runAllTimers)

  expect(await asAda.query(api.api.reminders.list, { projectId })).toEqual([])
  const [reminder] = await t.run((ctx) => ctx.db.query('reminders').take(10))
  expect(reminder).toMatchObject({
    status: 'sent',
    note: "Calls aren't set up yet and texting isn't linked, so it's only here.",
  })
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page[0]?.text).toContain('Call the bank')
})

test('a cancelled reminder never fires', async () => {
  const { t, asAda, projectId, threadId } = await setup()
  const id = await t.mutation(internal.api.reminders.schedule, {
    projectId,
    threadId,
    from: 'Matilda',
    message: 'Stretch',
    dueAt: Date.now() + HOUR,
    via: 'chat',
  })
  await asAda.mutation(api.api.reminders.cancel, { id })
  await t.finishAllScheduledFunctions(vi.runAllTimers)

  expect(await t.run((ctx) => ctx.db.get('reminders', id))).toMatchObject({
    status: 'cancelled',
  })
})

test('reminders in the past or over a year out are refused', async () => {
  const { t, projectId, threadId } = await setup()
  for (const dueAt of [Date.now() - HOUR, Date.now() + 400 * 24 * HOUR]) {
    await expect(
      t.mutation(internal.api.reminders.schedule, {
        projectId,
        threadId,
        from: 'Matilda',
        message: 'Nope',
        dueAt,
        via: 'chat',
      }),
    ).rejects.toThrow()
  }
})

test('a phone number must be in international format', async () => {
  const { asAda } = await setup()
  await expect(
    asAda.mutation(api.api.users.setPhone, { phone: '555-0123' }),
  ).rejects.toThrow('Use international format, like +14155550123.')
  await asAda.mutation(api.api.users.setPhone, { phone: '+14155550123' })
  expect(await asAda.query(api.api.reminders.callStatus, {})).toEqual({
    configured: false,
    phone: '+14155550123',
  })
})
