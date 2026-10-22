import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import { languageModel } from '../../lib/ai'
import schema from '../../schema'
import { modules } from '../../test.setup'

/** Every model id a reply asked the gateway for, beyond the default. */
const asked = vi.hoisted(() => [] as Array<string>)

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  const model = (text: string) =>
    mockModel({ content: [{ type: 'text', text }] })
  return {
    languageModel: model('Hello from the default.'),
    chatModel: (id: string) => {
      asked.push(id)
      return model(`Hello from ${id}.`)
    },
  }
})

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  asked.length = 0
  vi.useRealTimers()
})

const firstPage = { numItems: 10, cursor: null }

async function setup() {
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
  /** Sends a message and runs the reply, returning the chat and its texts. */
  const chat = async (args: {
    botId?: Awaited<ReturnType<typeof asAda.mutation<typeof api.api.bots.save>>>
    model?: string
    effort?: 'low' | 'medium' | 'high'
    prompt: string
  }) => {
    const threadId = await asAda.mutation(api.api.chat.sendMessage, {
      projectId,
      ...args,
    })
    // The reply streams, which needs real timers; fake ones only start it.
    vi.runAllTimers()
    vi.useRealTimers()
    await t.finishInProgressScheduledFunctions()
    vi.useFakeTimers()
    const { page } = await asAda.query(api.api.chat.listMessages, {
      threadId,
      paginationOpts: firstPage,
    })
    return { threadId, texts: page.map((m) => m.text) }
  }
  return { t, asAda, asBob: t.withIdentity({ subject: bob }), projectId, chat }
}

test('a bot and the lead reply with the model set on them, and the default otherwise', async () => {
  const { asAda, projectId, chat } = await setup()
  const ivy = await asAda.mutation(api.api.bots.save, {
    projectId,
    name: 'Ivy',
    role: 'Researcher',
    instructions: 'You dig.',
    model: 'openai/gpt-5-mini',
  })
  expect((await chat({ prompt: 'Hi' })).texts).toContain(
    'Hello from the default.',
  )
  expect((await chat({ botId: ivy, prompt: 'Hi' })).texts).toContain(
    'Hello from openai/gpt-5-mini.',
  )
  await asAda.mutation(api.api.projects.save, {
    id: projectId,
    name: 'Matilda',
    brief: '',
    guidelines: '',
    model: 'google/gemini-2.5-pro',
  })
  expect((await chat({ prompt: 'Hi again' })).texts).toContain(
    'Hello from google/gemini-2.5-pro.',
  )
  expect(asked).toEqual(['openai/gpt-5-mini', 'google/gemini-2.5-pro'])
})

test('a chat can switch models and keeps its history', async () => {
  const { t, asAda, chat } = await setup()
  const { threadId } = await chat({ prompt: 'First' })
  await asAda.mutation(api.api.threads.setModel, {
    threadId,
    model: 'anthropic/claude-opus-5',
  })
  const after = await chat({ prompt: 'Second' })
  expect(after.texts).toEqual([
    'First',
    'Hello from the default.',
    'Second',
    'Hello from anthropic/claude-opus-5.',
  ])
  // Back to the assistant's own.
  await asAda.mutation(api.api.threads.setModel, { threadId, model: null })
  const back = await chat({ prompt: 'Third' })
  expect(back.texts.at(-1)).toBe('Hello from the default.')
  const rows = await t.run((ctx) =>
    ctx.db
      .query('usage')
      .withIndex('by_thread', (q) => q.eq('threadId', threadId))
      .take(20),
  )
  expect(rows.filter((r) => r.kind === 'reply').map((r) => r.model)).toEqual([
    'anthropic/claude-sonnet-5',
    'anthropic/claude-opus-5',
    'anthropic/claude-sonnet-5',
  ])
})

test('a new chat can start on a model, and the thread remembers it', async () => {
  const { asAda, chat } = await setup()
  const { threadId, texts } = await chat({
    model: 'deepseek/deepseek-v3.2',
    prompt: 'Hi',
  })
  expect(texts).toContain('Hello from deepseek/deepseek-v3.2.')
  expect(await asAda.query(api.api.threads.get, { threadId })).toMatchObject({
    model: 'deepseek/deepseek-v3.2',
  })
})

test('model ids are checked, and only the owner can switch', async () => {
  const { asAda, asBob, projectId, chat } = await setup()
  await expect(
    asAda.mutation(api.api.bots.save, {
      projectId,
      name: 'Ivy',
      role: 'Researcher',
      instructions: 'You dig.',
      model: 'not a model',
    }),
  ).rejects.toThrow('Use a gateway model id like anthropic/claude-sonnet-5.')
  const { threadId } = await chat({ prompt: 'Hi' })
  await expect(
    asBob.mutation(api.api.threads.setModel, {
      threadId,
      model: 'openai/gpt-5',
    }),
  ).rejects.toThrow('Chat not found.')
  await expect(
    asAda.mutation(api.api.threads.setModel, { threadId, model: 'gpt-5' }),
  ).rejects.toThrow('Use a gateway model id like anthropic/claude-sonnet-5.')
})

test('a bot asked by the lead answers on its own model', async () => {
  const { t, asAda, projectId } = await setup()
  await asAda.mutation(api.api.bots.save, {
    projectId,
    name: 'Ivy',
    role: 'Researcher',
    instructions: 'You dig.',
    model: 'openai/gpt-5-mini',
  })
  const project = await asAda.query(api.api.projects.get, { id: projectId })
  if (!project) throw new Error('no project')
  const bots = await asAda.query(api.api.bots.list, { projectId })
  const threadId = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    prompt: 'Hi',
  })
  vi.runAllTimers()
  vi.useRealTimers()
  await t.finishInProgressScheduledFunctions()
  // The lead itself ran on the default; the mock records only what differs.
  expect(asked).toEqual([])
  expect(bots[0].model).toBe('openai/gpt-5-mini')
  expect(threadId).toBeTruthy()
  void internal
})

/** The reasoning effort each streamed reply asked the default model for, in order. */
function effortsAsked() {
  const calls = (
    languageModel as unknown as {
      doStreamCalls: Array<{
        providerOptions?: { convexGateway?: { reasoningEffort?: string } }
      }>
    }
  ).doStreamCalls
  return calls.map((c) => c.providerOptions?.convexGateway?.reasoningEffort)
}

test("effort is medium by default, then the assistant's own, then the chat's pick", async () => {
  const { asAda, projectId, chat } = await setup()
  const before = effortsAsked().length
  const { threadId } = await chat({ prompt: 'Hi' })
  await asAda.mutation(api.api.projects.save, {
    id: projectId,
    name: 'Matilda',
    brief: '',
    guidelines: '',
    effort: 'high',
  })
  await chat({ prompt: 'Think hard' })
  await asAda.mutation(api.api.threads.setEffort, { threadId, effort: 'low' })
  await chat({ prompt: 'Quick one' })
  await asAda.mutation(api.api.threads.setEffort, { threadId, effort: null })
  await chat({ prompt: 'Back to normal' })
  expect(effortsAsked().slice(before)).toEqual([
    'medium',
    'high',
    'low',
    'high',
  ])
})

test("only the chat's owner can set its effort", async () => {
  const { asBob, chat } = await setup()
  const { threadId } = await chat({ prompt: 'Hi' })
  await expect(
    asBob.mutation(api.api.threads.setEffort, { threadId, effort: 'high' }),
  ).rejects.toThrow('Chat not found.')
})
