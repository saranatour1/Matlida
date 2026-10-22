import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  return {
    // One model for every agent, so the steps play out in call order:
    // the lead calls ask_bot, Ivy replies, then the lead answers.
    languageModel: mockModel({
      contentSteps: [
        [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'ask_bot',
            input: JSON.stringify({ bot: 'Ivy', task: 'Find three sources.' }),
          },
        ],
        [{ type: 'text', text: 'Ivy found three sources.' }],
        [{ type: 'text', text: 'Ivy says there are three sources.' }],
      ],
    }),
  }
})

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

test('the lead hands work to a bot in a sub-thread of the chat', async () => {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  const ada = await t.run((ctx) => ctx.db.insert('users', {}))
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  const ivy = await asAda.mutation(api.api.bots.save, {
    projectId,
    name: 'Ivy',
    role: 'Researcher',
    instructions: 'You find sources.',
  })
  // Ivy joins the lead's chat before the first message.
  const leadChat = await t.mutation(internal.api.threads.start, {
    projectId,
    kind: 'chat',
    title: 'Matilda',
    userId: ada,
    memberIds: [ivy],
  })
  await t.run((ctx) =>
    ctx.db.patch('projects', projectId, { threadId: leadChat }),
  )

  const chatId = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    prompt: 'Research this for me.',
  })
  vi.runAllTimers()
  vi.useRealTimers()
  await t.finishInProgressScheduledFunctions()

  const subThreads = await asAda.query(api.api.threads.list, {
    projectId,
    kind: 'subagent',
  })
  expect(subThreads).toMatchObject([
    { kind: 'subagent', parentThreadId: chatId, title: 'Matilda → Ivy' },
  ])
  const firstPage = { numItems: 10, cursor: null }
  const ivyThread = await asAda.query(api.api.chat.listMessages, {
    threadId: subThreads[0].threadId,
    paginationOpts: firstPage,
  })
  expect(ivyThread.page.map((m) => m.text).sort()).toEqual([
    'Find three sources.',
    'Ivy found three sources.',
  ])

  const chat = await asAda.query(api.api.chat.listMessages, {
    threadId: chatId,
    paginationOpts: firstPage,
  })
  expect(chat.page.find((m) => m.role === 'assistant')?.text).toBe(
    'Ivy says there are three sources.',
  )
})
