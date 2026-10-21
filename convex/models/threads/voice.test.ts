import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'
import type * as Ai from 'ai'
import type * as Server from 'convex/server'

vi.mock('../../lib/ai', () => ({
  transcriptionModel: {},
  speechModel: {},
}))

const heard = vi.hoisted(() => ({ text: 'What is the capital of France?' }))
vi.mock('ai', async (original) => ({
  ...(await original<typeof Ai>()),
  transcribe: vi.fn(() =>
    Promise.resolve({ text: heard.text, providerMetadata: {} }),
  ),
}))

vi.mock('convex/server', async (original) => ({
  ...(await original<typeof Server>()),
  getServiceToken: () => Promise.resolve('token'),
}))

/** The gateway answering "Paris it is." in two audio chunks. */
function gateway() {
  const pcm = (n: number) => btoa(String.fromCharCode(...new Array(n).fill(1)))
  const events = [
    {
      choices: [
        { delta: { audio: { transcript: 'Paris ', data: pcm(40_000) } } },
      ],
    },
    {
      choices: [
        { delta: { audio: { transcript: 'it is.', data: pcm(40_000) } } },
      ],
    },
    {
      choices: [],
      usage: { prompt_tokens: 70, completion_tokens: 50, cost: 0.0002 },
    },
  ]
  return new Response(
    `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}data: [DONE]\n\n`,
  )
}

beforeEach(() => {
  heard.text = 'What is the capital of France?'
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(gateway())),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

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
  const clip = () =>
    t.run((ctx) => ctx.storage.store(new Blob(['RIFF'], { type: 'audio/wav' })))
  const messages = async (threadId: string) =>
    (
      await asAda.query(api.api.chat.listMessages, {
        threadId,
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page
  return {
    t,
    asAda,
    asBob: t.withIdentity({ subject: bob }),
    projectId,
    clip,
    messages,
  }
}

test('a Fast voice call turn answers in pieces and saves to the chat and the call', async () => {
  const { asAda, projectId, clip, messages } = await setup()
  const liveKey = 'fast-voice-turn-1'
  const result = await asAda.action(api.api.calls.turn, {
    projectId,
    storageId: await clip(),
    liveKey,
    fast: true,
  })
  expect(result).toMatchObject({
    transcript: 'What is the capital of France?',
    reply: 'Paris it is.',
  })
  // The first piece goes out after 0.6 seconds of audio, the rest at the end.
  expect(await asAda.query(api.api.calls.live, { key: liveKey })).toMatchObject(
    {
      heard: 'What is the capital of France?',
      done: true,
      pieces: [
        { text: 'Paris ', url: expect.any(String) },
        { text: 'it is.', url: expect.any(String) },
      ],
    },
  )
  expect((await messages(result.threadId!)).map((m) => m.text).sort()).toEqual([
    'Paris it is.',
    'What is the capital of France?',
  ])
})

test('a silent Fast voice turn gets no answer and saves nothing', async () => {
  heard.text = ''
  const { asAda, projectId, clip, messages } = await setup()
  const result = await asAda.action(api.api.calls.turn, {
    projectId,
    storageId: await clip(),
    liveKey: 'fast-voice-turn-2',
    fast: true,
  })
  expect(result).toMatchObject({ transcript: '', reply: null })
  const threadId = (await asAda.query(api.api.threads.main, { projectId }))!
  expect(await messages(threadId)).toEqual([])
})
