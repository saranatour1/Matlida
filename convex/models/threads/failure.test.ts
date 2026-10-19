import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  const reply = mockModel({ content: [{ type: 'text', text: 'Back again.' }] })
  let calls = 0
  return {
    languageModel: mockModel({
      doStream: (options) => {
        calls++
        if (calls === 1) throw new Error('The provider is down.')
        return reply.doStream(options)
      },
    }),
  }
})

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

async function finishReply(t: ReturnType<typeof convexTest>) {
  vi.runAllTimers()
  vi.useRealTimers()
  await t.finishInProgressScheduledFunctions()
  vi.useFakeTimers()
}

test('a failed reply shows as failed and the next message still gets one', async () => {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  const ada = await t.run((ctx) => ctx.db.insert('users', {}))
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  const messages = async (threadId: string) => {
    const { page } = await asAda.query(api.api.chat.listMessages, {
      threadId,
      paginationOpts: { numItems: 10, cursor: null },
    })
    return page.map((m) => [m.role, m.status, m.text])
  }

  const threadId = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    prompt: 'Hi there',
  })
  await finishReply(t)
  expect(await messages(threadId)).toEqual([
    ['user', 'success', 'Hi there'],
    ['assistant', 'failed', ''],
  ])

  await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    threadId,
    prompt: 'Try again',
  })
  await finishReply(t)
  expect(await messages(threadId)).toEqual([
    ['user', 'success', 'Hi there'],
    ['assistant', 'failed', ''],
    ['user', 'success', 'Try again'],
    ['assistant', 'success', 'Back again.'],
  ])
})
