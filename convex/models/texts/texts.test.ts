import agentTest from '@convex-dev/agent/test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import { languageModel } from '../../lib/ai'
import schema from '../../schema'
import { modules } from '../../test.setup'

vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  return {
    languageModel: mockModel({
      content: [{ type: 'text', text: 'Hi from Matilda.' }],
    }),
  }
})

const calls = (languageModel as unknown as { doGenerateCalls: Array<unknown> })
  .doGenerateCalls

beforeEach(() => {
  calls.length = 0
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

async function setup() {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  rateLimiterTest.register(t)
  const [ada, bob] = await t.run(async (ctx) => [
    await ctx.db.insert('users', {}),
    await ctx.db.insert('users', {}),
  ])
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  const text = (spaceId: string, message: string, platform = 'telegram') =>
    t.action(internal.api.texts.answer, { spaceId, platform, text: message })
  return {
    t,
    ada,
    bob,
    asAda,
    asBob: t.withIdentity({ subject: bob }),
    projectId,
    text,
  }
}

test('texting the code links the phone, once', async () => {
  const { asAda, projectId, text } = await setup()
  const code = await asAda.mutation(api.api.texts.startLink, { projectId })
  expect(code).toMatch(/^[A-Z0-9]{6}$/)
  expect(await asAda.query(api.api.texts.links, { projectId })).toMatchObject([
    { status: 'pending', code },
  ])

  expect(await text('space-1', `link ${code.toLowerCase()}`)).toBe(
    'Linked to Matilda. Message me anytime.',
  )
  expect(await asAda.query(api.api.texts.links, { projectId })).toMatchObject([
    { status: 'linked', spaceId: 'space-1', platform: 'telegram' },
  ])
  expect(await text('space-2', `link ${code}`)).toBe(
    "That code didn't match. Get a new one on the Messaging page in Matilda.",
  )
})

test('a code works for 10 minutes', async () => {
  const { asAda, projectId, text } = await setup()
  vi.useFakeTimers()
  const stale = await asAda.mutation(api.api.texts.startLink, { projectId })
  vi.advanceTimersByTime(11 * 60_000)
  expect(await text('space-1', `link ${stale}`)).toBe(
    "That code didn't match. Get a new one on the Messaging page in Matilda.",
  )
  expect(await asAda.query(api.api.texts.links, { projectId })).toMatchObject([
    { status: 'pending', code: stale },
  ])

  const fresh = await asAda.mutation(api.api.texts.startLink, { projectId })
  vi.advanceTimersByTime(9 * 60_000)
  expect(await text('space-1', `link ${fresh}`)).toBe(
    'Linked to Matilda. Message me anytime.',
  )
})

test('an unlinked number is told how to link', async () => {
  const { text } = await setup()
  expect(await text('space-x', 'hello?')).toBe(
    "This chat isn't linked yet. Open Messaging in Matilda and send me the code it shows.",
  )
})

test('a linked chat talks to the lead in its own chat, in plain text', async () => {
  const { asAda, projectId, text } = await setup()
  const code = await asAda.mutation(api.api.texts.startLink, { projectId })
  await text('space-1', `link ${code}`)

  expect(await text('space-1', 'What is on today?')).toBe('Hi from Matilda.')

  expect(JSON.stringify(calls)).toContain('You are replying by text message')
  const [chat] = await asAda.query(api.api.threads.list, {
    projectId,
    kind: 'chat',
  })
  expect(chat).toMatchObject({ title: 'Matilda' })
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId: chat.threadId,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page.map((m) => m.text).sort()).toEqual([
    'Hi from Matilda.',
    'What is on today?',
  ])
})

test('a linked owner who floods is asked to slow down', async () => {
  const { asAda, projectId, text } = await setup()
  vi.useFakeTimers()
  const code = await asAda.mutation(api.api.texts.startLink, { projectId })
  await text('tg-1', `link ${code}`)
  for (let i = 0; i < 15; i++) {
    expect(await text('tg-1', `hi ${i}`)).toBe('Hi from Matilda.')
  }
  expect(await text('tg-1', 'one more')).toBe(
    "You're sending a lot of messages. Give me a few minutes and try again.",
  )
  expect(calls).toHaveLength(15)
})

test('an unlinked chat that floods is answered a few times, then ignored', async () => {
  const { text } = await setup()
  vi.useFakeTimers()
  for (let i = 0; i < 15; i++) {
    expect(await text('stranger', `hello ${i}`)).toBe(
      "This chat isn't linked yet. Open Messaging in Matilda and send me the code it shows.",
    )
  }
  expect(await text('stranger', 'hello again')).toBe('')
})

test('guessing link codes is cut off, silently', async () => {
  const { asAda, projectId, text } = await setup()
  vi.useFakeTimers()
  const code = await asAda.mutation(api.api.texts.startLink, { projectId })
  for (let i = 0; i < 5; i++) {
    expect(await text('guess', `link AAAAA${i}`)).toBe(
      "That code didn't match. Get a new one on the Messaging page in Matilda.",
    )
  }
  // Even the right code waits now; the user gets a fresh one later.
  expect(await text('guess', `link ${code}`)).toBe('')
  expect(await asAda.query(api.api.texts.links, { projectId })).toMatchObject([
    { status: 'pending', code },
  ])
})

test('only the owner can start or read a link', async () => {
  const { asBob, projectId } = await setup()
  await expect(
    asBob.mutation(api.api.texts.startLink, { projectId }),
  ).rejects.toThrow('Project not found.')
  await expect(asBob.query(api.api.texts.links, { projectId })).rejects.toThrow(
    'Project not found.',
  )
})

test('a project links one Telegram chat, and relinking replaces it', async () => {
  const { asAda, projectId, text } = await setup()
  const link = async (spaceId: string, platform: string) =>
    await text(
      spaceId,
      `link ${await asAda.mutation(api.api.texts.startLink, { projectId })}`,
      platform,
    )
  await link('telegram-1', 'telegram')
  await link('telegram-2', 'telegram')

  const links = await asAda.query(api.api.texts.links, { projectId })
  expect(links.map((l) => l.status === 'linked' && l.spaceId)).toEqual([
    'telegram-2',
  ])
})

test('texts only ever go to the lead, even with @name', async () => {
  const { asAda, projectId, text } = await setup()
  await asAda.mutation(api.api.bots.save, {
    projectId,
    name: 'Ivy',
    role: 'Researcher',
    instructions: 'You dig into questions.',
  })
  const code = await asAda.mutation(api.api.texts.startLink, { projectId })
  await text('tg-1', `link ${code}`, 'telegram')

  expect(await text('tg-1', '@ivy, find me a cafe', 'telegram')).toBe(
    'Hi from Matilda.',
  )
  const chats = await asAda.query(api.api.threads.list, {
    projectId,
    kind: 'chat',
  })
  expect(chats.map((c) => [c.title, c.botId])).toEqual([['Matilda', undefined]])
})

test('find_texts searches what you texted from Telegram, and only yours', async () => {
  const { t, ada, bob, asAda, projectId, text } = await setup()
  await text('tg-1', 'pick up the dry cleaning', 'telegram')
  const code = await asAda.mutation(api.api.texts.startLink, { projectId })
  await text('tg-1', `link ${code}`, 'telegram')
  await text('tg-1', 'Remind me about the dry cleaning on Friday', 'telegram')
  await text('tg-1', 'And book the dentist', 'telegram')
  const search = (userId: typeof ada, query: string) =>
    t.query(internal.api.texts.search, { userId, query })

  expect(await search(ada, 'dry cleaning')).toMatchObject([
    {
      platform: 'telegram',
      text: 'Remind me about the dry cleaning on Friday',
    },
  ])
  expect(await search(ada, code)).toEqual([])
  expect(await search(bob, 'dentist')).toEqual([])
})
