import { createThread } from '@convex-dev/agent'
import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { expect, test, vi } from 'vitest'
import { generateSpeech } from 'ai'
import { api, components, internal } from '../../_generated/api'
import schema from '../../schema'
import { languageModel } from '../../lib/ai'
import { modules } from '../../test.setup'
import type { Id } from '../../_generated/dataModel'
import type * as Ai from 'ai'

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  return {
    languageModel: mockModel({
      content: [{ type: 'text', text: 'Sure, talk soon. Bye for now.' }],
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
  vi.mocked(generateSpeech).mockClear()
  const { t, asAda, asBob, projectId, clip } = await setup()
  const storageId = await clip()

  const liveKey = 'live-turn-key-1'
  const result = await asAda.action(api.api.calls.turn, {
    liveKey,
    projectId,
    storageId,
  })

  expect(result).toMatchObject({
    transcript: 'Hello Matilda',
    reply: 'Sure, talk soon. Bye for now.',
  })
  // Spoken a sentence at a time, in order, into the live turn the browser watches.
  expect(await asAda.query(api.api.calls.live, { key: liveKey })).toMatchObject(
    {
      heard: 'Hello Matilda',
      done: true,
      pieces: [
        { text: 'Sure, talk soon.', url: expect.any(String) },
        { text: 'Bye for now.', url: expect.any(String) },
      ],
    },
  )
  expect(vi.mocked(generateSpeech).mock.calls.map(([o]) => o.text)).toEqual([
    'Sure, talk soon.',
    'Bye for now.',
  ])
  expect(await asBob.query(api.api.calls.live, { key: liveKey })).toBeNull()
  expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull()
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId: result.threadId ?? '',
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page.map((m) => m.text).sort()).toEqual([
    'Hello Matilda',
    'Sure, talk soon. Bye for now.',
  ])
})

test('silence gets no reply and starts no chat', async () => {
  heard.text = ''
  const { t, asAda, projectId, clip } = await setup()

  const result = await asAda.action(api.api.calls.turn, {
    liveKey: crypto.randomUUID(),
    projectId,
    storageId: await clip(),
  })

  expect(result).toEqual({
    threadId: null,
    callId: null,
    transcript: '',
    reply: null,
  })
  expect(await t.run((ctx) => ctx.db.query('threads').take(1))).toEqual([])
})

test("you can't call into someone else's workspace", async () => {
  heard.text = 'Let me in'
  const { asBob, projectId, clip } = await setup()

  await expect(
    asBob.action(api.api.calls.turn, {
      liveKey: crypto.randomUUID(),
      projectId,
      storageId: await clip(),
    }),
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

test('a call keeps every line from its first turn, for you only', async () => {
  heard.text = 'Hello Matilda'
  const { t, asAda, asBob, projectId, clip } = await setup()

  const first = await asAda.action(api.api.calls.turn, {
    liveKey: crypto.randomUUID(),
    projectId,
    storageId: await clip(),
  })
  heard.text = 'And again'
  const second = await asAda.action(api.api.calls.turn, {
    liveKey: crypto.randomUUID(),
    projectId,
    threadId: first.threadId ?? undefined,
    storageId: await clip(),
    callId: first.callId ?? undefined,
  })
  const callId = first.callId
  if (!callId) throw new Error('The first turn should start a call.')
  expect(second.callId).toBe(callId)

  const lines = await asAda.query(api.api.calls.transcript, { id: callId })
  expect(lines.map((l) => [l.who, l.text])).toEqual([
    ['you', 'Hello Matilda'],
    ['them', 'Sure, talk soon. Bye for now.'],
    ['you', 'And again'],
    ['them', 'Sure, talk soon. Bye for now.'],
  ])
  expect(lines[1]?.ms).toEqual(expect.any(Number))
  // Never hung up (a closed tab): it still ends at its last line.
  expect(await asAda.query(api.api.calls.history, { projectId })).toMatchObject(
    [
      {
        _id: callId,
        threadId: first.threadId,
        firstLine: 'Hello Matilda',
        endedAt: lines[3]?._creationTime,
      },
    ],
  )
  const text = await t.query(internal.api.calls.dump, {})
  expect(text).toContain('Call with Matilda')
  expect(text).toMatch(/\] You: Hello Matilda/)
  expect(text).toMatch(
    /\] Matilda, first words in \d+\.\d s, all of it in \d+\.\d s: Sure, talk soon\./,
  )

  await expect(
    asBob.query(api.api.calls.transcript, { id: callId }),
  ).rejects.toThrow('Project not found.')
  const bobsProject = await asBob.mutation(api.api.projects.save, {
    name: 'Bob',
    brief: '',
    guidelines: '',
  })
  await expect(
    asBob.action(api.api.calls.turn, {
      liveKey: crypto.randomUUID(),
      projectId: bobsProject,
      storageId: await clip(),
      callId,
    }),
  ).rejects.toThrow('Call not found.')
})

test('answering a ring starts the call with its opening line', async () => {
  const { t, asAda, projectId } = await setup()
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
  const answered = await asAda.action(api.api.calls.answer, { id })
  if (!answered) throw new Error('The ring should be answered.')
  expect(
    (await asAda.query(api.api.calls.transcript, { id: answered.callId })).map(
      (l) => [l.who, l.text],
    ),
  ).toEqual([['them', "Hi, it's Matilda with your reminder. Stretch"]])
})

test('talking over a reply marks it cut off in the call history', async () => {
  heard.text = 'Tell me a long story'
  const { t, asAda, projectId, clip } = await setup()
  const first = await asAda.action(api.api.calls.turn, {
    liveKey: crypto.randomUUID(),
    projectId,
    storageId: await clip(),
  })
  heard.text = 'Actually, stop'
  await asAda.action(api.api.calls.turn, {
    liveKey: crypto.randomUUID(),
    projectId,
    threadId: first.threadId ?? undefined,
    storageId: await clip(),
    callId: first.callId ?? undefined,
    interrupted: true,
  })
  const lines = await asAda.query(api.api.calls.transcript, {
    id: first.callId ?? ('' as Id<'calls'>),
  })
  expect(lines.map((l) => [l.who, l.cutOff ?? false])).toEqual([
    ['you', false],
    ['them', true],
    ['you', false],
    ['them', false],
  ])
  expect(await t.query(internal.api.calls.dump, {})).toContain(
    'Sure, talk soon. Bye for now. (you cut in)',
  )
  const prompts = (
    languageModel as unknown as { doStreamCalls: Array<unknown> }
  ).doStreamCalls.map((call) => JSON.stringify(call))
  expect(prompts.at(-1)).toContain('talked over your last reply')
  expect(prompts.at(-2)).not.toContain('talked over your last reply')
})
