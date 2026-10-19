import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { expect, test, vi } from 'vitest'
import { api } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'
import type * as Ai from 'ai'

vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  return {
    languageModel: mockModel({
      content: [{ type: 'text', text: 'Sure, talk soon.' }],
    }),
    transcriptionModel: {},
    speechModel: {},
  }
})

const heard = vi.hoisted(() => ({ text: 'Hello Matilda' }))
vi.mock('ai', async (original) => ({
  ...(await original<typeof Ai>()),
  transcribe: vi.fn(() =>
    Promise.resolve({ text: heard.text, providerMetadata: {} }),
  ),
  generateSpeech: vi.fn(() =>
    Promise.resolve({
      audio: { uint8Array: new Uint8Array([1, 2, 3]), mediaType: 'audio/mpeg' },
    }),
  ),
}))

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
    t.run((ctx) =>
      ctx.storage.store(new Blob(['voice'], { type: 'audio/webm' })),
    )
  return { t, asAda, asBob: t.withIdentity({ subject: bob }), projectId, clip }
}

test('a call turn saves what you said and the reply, and returns it spoken', async () => {
  heard.text = 'Hello Matilda'
  const { t, asAda, projectId, clip } = await setup()
  const storageId = await clip()

  const result = await asAda.action(api.api.calls.turn, {
    projectId,
    storageId,
  })

  expect(result).toMatchObject({
    transcript: 'Hello Matilda',
    reply: 'Sure, talk soon.',
  })
  expect(result.audioUrl).toEqual(expect.any(String))
  expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull()
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId: result.threadId ?? '',
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page.map((m) => m.text).sort()).toEqual([
    'Hello Matilda',
    'Sure, talk soon.',
  ])
})

test('silence gets no reply and starts no chat', async () => {
  heard.text = ''
  const { t, asAda, projectId, clip } = await setup()

  const result = await asAda.action(api.api.calls.turn, {
    projectId,
    storageId: await clip(),
  })

  expect(result).toEqual({
    threadId: null,
    transcript: '',
    reply: null,
    audioUrl: null,
  })
  expect(await t.run((ctx) => ctx.db.query('threads').take(1))).toEqual([])
})

test("you can't call into someone else's workspace", async () => {
  heard.text = 'Let me in'
  const { asBob, projectId, clip } = await setup()

  await expect(
    asBob.action(api.api.calls.turn, { projectId, storageId: await clip() }),
  ).rejects.toThrow('Project not found.')
})
