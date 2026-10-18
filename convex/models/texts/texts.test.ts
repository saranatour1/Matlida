import agentTest from '@convex-dev/agent/test'
import spectrumTest from '@spectrum-ts/convex/test'
import { convexTest } from 'convex-test'
import { beforeEach, expect, test, vi } from 'vitest'
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

async function setup() {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  spectrumTest.register(t)
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
  const text = (spaceId: string, message: string) =>
    t.action(internal.api.texts.answer, { spaceId, text: message })
  return { t, asAda, asBob: t.withIdentity({ subject: bob }), projectId, text }
}

test('texting the code links the phone, once', async () => {
  const { asAda, projectId, text } = await setup()
  const code = await asAda.mutation(api.api.texts.startLink, { projectId })
  expect(code).toMatch(/^[A-Z0-9]{6}$/)
  expect(await asAda.query(api.api.texts.link, { projectId })).toMatchObject({
    status: 'pending',
    code,
  })

  expect(await text('space-1', `link ${code.toLowerCase()}`)).toBe(
    'Linked to Matilda. Text me anytime.',
  )
  expect(await asAda.query(api.api.texts.link, { projectId })).toMatchObject({
    status: 'linked',
    spaceId: 'space-1',
  })
  expect(await text('space-2', `link ${code}`)).toBe(
    "That code didn't match. Get a new one on the Texting page in Matilda.",
  )
})

test('an unlinked number is told how to link', async () => {
  const { text } = await setup()
  expect(await text('space-x', 'hello?')).toBe(
    "This number isn't linked yet. Open Texting in Matilda and text me the code it shows.",
  )
})

test('a linked phone talks to the lead in a Texts chat, in plain text', async () => {
  const { asAda, projectId, text } = await setup()
  const code = await asAda.mutation(api.api.texts.startLink, { projectId })
  await text('space-1', `link ${code}`)

  expect(await text('space-1', 'What is on today?')).toBe('Hi from Matilda.')

  expect(JSON.stringify(calls)).toContain('You are replying by text message')
  const [chat] = await asAda.query(api.api.threads.list, {
    projectId,
    kind: 'chat',
  })
  expect(chat).toMatchObject({ title: 'Texts' })
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId: chat.threadId,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page.map((m) => m.text).sort()).toEqual([
    'Hi from Matilda.',
    'What is on today?',
  ])
})

test('only the owner can start or read a link', async () => {
  const { asBob, projectId } = await setup()
  await expect(
    asBob.mutation(api.api.texts.startLink, { projectId }),
  ).rejects.toThrow('Project not found.')
  await expect(asBob.query(api.api.texts.link, { projectId })).rejects.toThrow(
    'Project not found.',
  )
})
