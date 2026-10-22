import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'
import type { LanguageModelV4Prompt } from '@ai-sdk/provider'

const leadPrompts = vi.hoisted(() => [] as Array<LanguageModelV4Prompt>)

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  const askFour = (step: number) =>
    mockModel({
      content: Array.from({ length: 4 }, (_, i) => ({
        type: 'tool-call' as const,
        toolCallId: `call-${step}-${i}`,
        toolName: 'ask_bot',
        input: JSON.stringify({ bot: 'Ivy', task: `Task ${step}-${i}` }),
      })),
    })
  const leadSteps = [askFour(1), askFour(2)]
  const answer = mockModel({ content: [{ type: 'text', text: 'Done.' }] })
  return {
    languageModel: mockModel({
      doStream: (options) => {
        const step = leadSteps[leadPrompts.length] ?? answer
        leadPrompts.push(options.prompt)
        return step.doStream(options)
      },
      doGenerate: (options) => answer.doGenerate(options),
    }),
  }
})

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

test('one reply asks bots at most six times', async () => {
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
  // Ivy joins the lead before the first message.
  await asAda.mutation(api.api.threads.setMembers, {
    projectId,
    memberIds: [ivy],
  })

  const chatId = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    prompt: 'Research everything.',
  })
  vi.runAllTimers()
  vi.useRealTimers()
  await t.finishInProgressScheduledFunctions()

  // Six asks, each in Ivy's own chat.
  const ivyThreadId = await asAda.query(api.api.threads.main, {
    projectId,
    botId: ivy,
  })
  const asks = await asAda.query(api.api.chat.listMessages, {
    threadId: ivyThreadId ?? '',
    paginationOpts: { numItems: 50, cursor: null },
  })
  expect(asks.page.filter((m) => m.role === 'user')).toHaveLength(6)
  expect(
    JSON.stringify(leadPrompts.at(-1)).match(
      /Bot budget for this reply is used up/g,
    ),
  ).toHaveLength(2)
  const chat = await asAda.query(api.api.chat.listMessages, {
    threadId: chatId,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(chat.page.at(-1)).toMatchObject({
    role: 'assistant',
    status: 'success',
    text: 'Done.',
  })
})
