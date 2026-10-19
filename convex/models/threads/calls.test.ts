import { createThread } from '@convex-dev/agent'
import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { expect, test, vi } from 'vitest'
import { api, components, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'
import type { Id } from '../../_generated/dataModel'
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

async function chatWithReminder(
  t: Awaited<ReturnType<typeof setup>>['t'],
  projectId: Id<'projects'>,
) {
  return await t.run(async (ctx) => {
    const project = await ctx.db.get('projects', projectId)
    const threadId = await createThread(ctx, components.agent, {
      userId: project?.ownerId,
    })
    await ctx.db.insert('threads', {
      projectId,
      threadId,
      kind: 'chat',
      title: 'Chat',
    })
    return threadId
  })
}

test('a call reminder rings, then counts as missed and lands in the chat', async () => {
  vi.useFakeTimers()
  const { t, asAda, projectId } = await setup()
  const threadId = await chatWithReminder(t, projectId)
  await t.mutation(internal.api.reminders.schedule, {
    projectId,
    threadId,
    from: 'Matilda',
    message: 'Stretch',
    dueAt: Date.now() + 60_000,
    via: 'call',
  })

  vi.advanceTimersByTime(60_000)
  await t.finishInProgressScheduledFunctions()
  expect(await asAda.query(api.api.reminders.ringing, {})).toMatchObject([
    { from: 'Matilda', threadId },
  ])

  vi.advanceTimersByTime(30_000)
  await t.finishInProgressScheduledFunctions()
  vi.useRealTimers()
  expect(await asAda.query(api.api.reminders.ringing, {})).toEqual([])
  const [reminder] = await t.run((ctx) => ctx.db.query('reminders').take(1))
  expect(reminder).toMatchObject({
    status: 'sent',
    note: 'You missed the call.',
  })
})

test('answering a ringing reminder opens with it spoken, once, and only for you', async () => {
  const { t, asAda, asBob, projectId } = await setup()
  const threadId = await chatWithReminder(t, projectId)
  const id = await t.run((ctx) =>
    ctx.db.insert('reminders', {
      projectId,
      threadId,
      from: 'Matilda',
      message: 'Stretch',
      dueAt: Date.now(),
      via: 'call',
      status: 'ringing',
    }),
  )

  await expect(asBob.action(api.api.calls.answer, { id })).rejects.toThrow(
    'Project not found.',
  )
  const call = await asAda.action(api.api.calls.answer, { id })

  expect(call).toMatchObject({
    projectId,
    threadId,
    text: "Hi, it's Matilda with your reminder. Stretch",
    audioUrl: expect.any(String),
  })
  expect(await t.run((ctx) => ctx.db.get('reminders', id))).toMatchObject({
    status: 'sent',
    note: 'You picked up.',
  })
  expect(await asAda.action(api.api.calls.answer, { id })).toBeNull()
})

test('a call keeps its transcript, for you only', async () => {
  heard.text = 'Hello Matilda'
  const { asAda, asBob, projectId, clip } = await setup()
  const callId = await asAda.mutation(api.api.calls.begin, {
    projectId,
    opening: 'Hi, it is Matilda.',
  })

  const result = await asAda.action(api.api.calls.turn, {
    projectId,
    storageId: await clip(),
    callId,
  })
  await asAda.mutation(api.api.calls.end, { id: callId })

  expect(
    (await asAda.query(api.api.calls.transcript, { id: callId })).map((l) => [
      l.who,
      l.text,
    ]),
  ).toEqual([
    ['them', 'Hi, it is Matilda.'],
    ['you', 'Hello Matilda'],
    ['them', 'Sure, talk soon.'],
  ])
  expect(await asAda.query(api.api.calls.history, { projectId })).toMatchObject(
    [
      {
        _id: callId,
        threadId: result.threadId,
        firstLine: 'Hi, it is Matilda.',
        endedAt: expect.any(Number),
      },
    ],
  )
  await expect(
    asBob.query(api.api.calls.transcript, { id: callId }),
  ).rejects.toThrow('Project not found.')
  await expect(
    asBob.mutation(api.api.calls.begin, { projectId }),
  ).rejects.toThrow('Project not found.')
})
