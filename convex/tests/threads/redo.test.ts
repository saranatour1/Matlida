import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { beforeEach, expect, test, vi } from 'vitest'
import { api, components } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

/** Each reply says which one it is, so a redo shows. */
const replies = vi.hoisted(() => ({ count: 0 }))

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  const reply = () =>
    mockModel({
      content: [{ type: 'text', text: `Reply ${++replies.count}` }],
    })
  return {
    languageModel: mockModel({
      doStream: (options) => reply().doStream(options),
      doGenerate: (options) => reply().doGenerate(options),
    }),
  }
})

beforeEach(() => {
  replies.count = 0
})

const setup = async () => {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  const [ada, bob] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { name: 'Ada' }),
    await ctx.db.insert('users', { name: 'Bob' }),
  ])
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  /** Runs `start`, then the reply it schedules to the end, as `delegation.test.ts` does. */
  const settle = async <T>(start: () => Promise<T>) => {
    vi.useFakeTimers()
    const result = await start()
    vi.runAllTimers()
    vi.useRealTimers()
    await t.finishInProgressScheduledFunctions()
    return result
  }
  const threadId = await settle(() =>
    asAda.mutation(api.api.chat.sendMessage, {
      projectId,
      prompt: 'First question',
    }),
  )
  const chat = async () =>
    (
      await asAda.query(api.api.chat.listMessages, {
        threadId,
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page.map((m) => ({ id: m.id, role: m.role, text: m.text }))
  const asBob = t.withIdentity({ subject: bob })
  return { t, asAda, asBob, projectId, threadId, settle, chat }
}

test('retry answers the last message again, in place of the old reply', async () => {
  const { asAda, threadId, settle, chat } = await setup()
  const [question] = await chat()
  expect((await chat()).map((m) => m.text)).toEqual([
    'First question',
    'Reply 1',
  ])
  await settle(() =>
    asAda.mutation(api.api.chat.redo, { threadId, messageId: question.id }),
  )
  expect((await chat()).map((m) => m.text)).toEqual([
    'First question',
    'Reply 2',
  ])
})

test('editing a message replaces it and drops everything after it', async () => {
  const { asAda, projectId, threadId, settle, chat } = await setup()
  await settle(() =>
    asAda.mutation(api.api.chat.sendMessage, {
      projectId,
      prompt: 'Second question',
    }),
  )
  const [first] = await chat()
  await settle(() =>
    asAda.mutation(api.api.chat.redo, {
      threadId,
      messageId: first.id,
      prompt: 'A better first question',
    }),
  )
  expect((await chat()).map((m) => m.text)).toEqual([
    'A better first question',
    'Reply 3',
  ])
})

test('only your own messages, in your own chat, can be redone', async () => {
  const { asAda, asBob, threadId, chat } = await setup()
  const [question, reply] = await chat()
  await expect(
    asBob.mutation(api.api.chat.redo, { threadId, messageId: question.id }),
  ).rejects.toThrow('Chat not found.')
  await expect(
    asAda.mutation(api.api.chat.redo, { threadId, messageId: reply.id }),
  ).rejects.toThrow('Message not found.')
})

test('stop clears a reply left pending, so the chat can go on', async () => {
  const { t, asAda, asBob, threadId } = await setup()
  // A reply whose action died, like one out of memory, stays pending.
  await t.run((ctx) =>
    ctx.runMutation(components.agent.messages.addMessages, {
      threadId,
      messages: [
        { message: { role: 'assistant', content: '' }, status: 'pending' },
      ],
    }),
  )
  const last = async () =>
    (
      await asAda.query(api.api.chat.listMessages, {
        threadId,
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page.at(-1)
  expect(await last()).toMatchObject({ status: 'pending' })
  await expect(asBob.mutation(api.api.chat.stop, { threadId })).rejects.toThrow(
    'Chat not found.',
  )
  await asAda.mutation(api.api.chat.stop, { threadId })
  expect(await last()).toMatchObject({ status: 'success', text: '_Stopped._' })
  // Nothing left to stop: no second note.
  await asAda.mutation(api.api.chat.stop, { threadId })
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId,
    paginationOpts: { numItems: 20, cursor: null },
  })
  expect(page.filter((m) => m.text === '_Stopped._')).toHaveLength(1)
})
