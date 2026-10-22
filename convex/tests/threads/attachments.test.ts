import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { expect, test, vi } from 'vitest'
import { api } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'
import type { LanguageModelV4Prompt } from '@ai-sdk/provider'

const prompts = vi.hoisted(() => [] as Array<LanguageModelV4Prompt>)

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  const answer = mockModel({ content: [{ type: 'text', text: 'Got it.' }] })
  return {
    languageModel: mockModel({
      // Takes files by URL, so the test's storage URLs aren't downloaded.
      supportedUrls: { '*/*': [/.*/] },
      doStream: (options) => {
        prompts.push(options.prompt)
        return answer.doStream(options)
      },
    }),
  }
})

const setup = async () => {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  const ada = await t.run((ctx) => ctx.db.insert('users', { name: 'Ada' }))
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  const store = (type: string, bytes = 3) =>
    t.run((ctx) =>
      ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })),
    )
  return { t, asAda, projectId, store }
}

test('a picture and a PDF go with the message, and show in the chat', async () => {
  const { asAda, projectId, store } = await setup()
  const threadId = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    prompt: 'What are these?',
    files: [
      {
        storageId: await store('image/png'),
        filename: 'cat.png',
        mediaType: 'image/png',
      },
      {
        storageId: await store('application/pdf'),
        filename: 'menu.pdf',
        mediaType: 'application/pdf',
      },
    ],
  })
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page[0]).toMatchObject({
    role: 'user',
    text: 'What are these?',
    parts: [
      { type: 'text', text: 'What are these?' },
      { type: 'file', mediaType: 'image/png', url: expect.any(String) },
      { type: 'file', mediaType: 'application/pdf', filename: 'menu.pdf' },
    ],
  })
})

test('only pictures and PDFs, at most 10 MB, can be attached', async () => {
  const { asAda, projectId, store } = await setup()
  const send = async (type: string, bytes?: number) =>
    asAda.mutation(api.api.chat.sendMessage, {
      projectId,
      prompt: 'Look',
      files: [
        { storageId: await store(type, bytes), filename: 'f', mediaType: type },
      ],
    })
  // Markdown and audio would be swept by `commands.sweepFiles`.
  await expect(send('text/markdown')).rejects.toThrow(
    'You can attach pictures and PDFs.',
  )
  await expect(send('audio/webm')).rejects.toThrow()
  await expect(send('image/png', 11 * 1024 * 1024)).rejects.toThrow(
    'at most 10 MB',
  )
})

test('only the message being answered sends its attachments', async () => {
  const { t, asAda, projectId, store } = await setup()
  const send = async (
    prompt: string,
    files: Array<{
      storageId: Awaited<ReturnType<typeof store>>
      filename: string
      mediaType: string
    }> = [],
  ) => {
    vi.useFakeTimers()
    await asAda.mutation(api.api.chat.sendMessage, { projectId, prompt, files })
    // The reply's stream needs real timers, so fake ones only start it.
    vi.runAllTimers()
    vi.useRealTimers()
    await t.finishInProgressScheduledFunctions()
  }
  const userParts = (prompt: LanguageModelV4Prompt) =>
    prompt.flatMap((m) =>
      m.role === 'user'
        ? m.content.map((p) => (p.type === 'text' ? p.text : p.type))
        : [],
    )
  prompts.length = 0
  await send('What is this?', [
    {
      storageId: await store('application/pdf'),
      filename: 'menu.pdf',
      mediaType: 'application/pdf',
    },
  ])
  await send('Thanks')
  expect(prompts).toHaveLength(2)
  expect(userParts(prompts[0])).toEqual(['What is this?', 'file'])
  expect(userParts(prompts[1])).toEqual([
    'What is this?',
    '[menu.pdf attached earlier]',
    'Thanks',
  ])
})
