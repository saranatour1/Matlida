import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

/** Every email the app asked Resend to send. */
const sent = vi.hoisted(() => [] as Array<Record<string, unknown>>)

vi.mock('@convex-dev/resend', () => ({
  Resend: class {
    sendEmail(_ctx: unknown, options: Record<string, unknown>) {
      sent.push(options)
      return Promise.resolve(`email_${sent.length}`)
    }
  },
}))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  sent.length = 0
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup() {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  const ada = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Ada', email: 'ada@example.com' }),
  )
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

test('a due text reminder lands in the chat when texting is not linked', async () => {
  const { t, asAda, projectId, threadId } = await setup()
  await t.mutation(internal.api.reminders.schedule, {
    projectId,
    threadId,
    from: 'Matilda',
    message: 'Call the bank',
    dueAt: Date.now() + HOUR,
    via: 'text',
  })
  expect(await asAda.query(api.api.reminders.list, { projectId })).toHaveLength(
    1,
  )

  await t.finishAllScheduledFunctions(vi.runAllTimers)

  expect(await asAda.query(api.api.reminders.list, { projectId })).toEqual([])
  const [reminder] = await t.run((ctx) => ctx.db.query('reminders').take(10))
  expect(reminder).toMatchObject({
    status: 'sent',
    note: "Texting isn't linked, so it's only here.",
  })
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page[0]?.text).toContain('Call the bank')
})

test('a due email reminder is emailed to the owner from their assistant address', async () => {
  const { t, asAda, projectId, threadId } = await setup()
  vi.stubEnv('MAIL_DOMAIN', 'mail.example.com')
  await asAda.mutation(api.api.mailboxes.claim, { projectId, handle: 'ada' })
  const id = await t.mutation(internal.api.reminders.schedule, {
    projectId,
    threadId,
    from: 'Matilda',
    message: 'Call the bank',
    dueAt: Date.now() + HOUR,
    via: 'email',
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)

  expect(sent).toEqual([
    {
      from: '"Matilda" <ada@mail.example.com>',
      to: 'ada@example.com',
      subject: 'Reminder: Call the bank',
      text: 'Call the bank\n\nMatilda',
      idempotencyKey: `reminder:${id}`,
    },
  ])
  const [reminder] = await t.run((ctx) => ctx.db.query('reminders').take(10))
  expect(reminder).toMatchObject({ status: 'sent' })
  expect(reminder.note).toBeUndefined()
})

test('an email reminder without an address only lands in the chat', async () => {
  const { t, projectId, threadId } = await setup()
  await t.mutation(internal.api.reminders.schedule, {
    projectId,
    threadId,
    from: 'Matilda',
    message: 'Call the bank',
    dueAt: Date.now() + HOUR,
    via: 'email',
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(sent).toEqual([])
  const [reminder] = await t.run((ctx) => ctx.db.query('reminders').take(10))
  expect(reminder).toMatchObject({
    status: 'sent',
    note: "Email isn't set up, so it's only here.",
  })
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
