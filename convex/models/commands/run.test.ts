import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api } from '../../_generated/api'
import { languageModel } from '../../lib/ai'
import schema from '../../schema'
import { modules } from '../../test.setup'

vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  return {
    languageModel: mockModel({
      content: [{ type: 'text', text: 'Standup done.' }],
    }),
  }
})

/** What the mock model was sent, to check the lead's instructions. */
const calls = (languageModel as unknown as { doStreamCalls: Array<unknown> })
  .doStreamCalls

beforeEach(() => {
  vi.useFakeTimers()
  calls.length = 0
})
afterEach(() => {
  vi.useRealTimers()
})

async function setup() {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  const ada = await t.run((ctx) => ctx.db.insert('users', {}))
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  await asAda.action(api.api.commands.save, {
    projectId,
    name: 'standup',
    description: 'Run a standup.',
    markdown: 'List each bot with its top priority.',
  })
  return { t, asAda, projectId }
}

test("/name runs the command: its markdown from storage joins the lead's instructions", async () => {
  const { t, asAda, projectId } = await setup()

  const threadId = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    prompt: '/standup today',
  })
  vi.runAllTimers()
  vi.useRealTimers()
  await t.finishInProgressScheduledFunctions()

  const sent = JSON.stringify(calls)
  expect(sent).toContain('The user ran the /standup command.')
  expect(sent).toContain('List each bot with its top priority.')
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page.map((m) => m.text).sort()).toEqual([
    '/standup today',
    'Standup done.',
  ])
})

test('an unknown /name is rejected before a chat starts', async () => {
  const { asAda, projectId } = await setup()
  await expect(
    asAda.mutation(api.api.chat.sendMessage, { projectId, prompt: '/nope' }),
  ).rejects.toThrow("There's no /nope command.")
  expect(
    await asAda.query(api.api.threads.list, { projectId, kind: 'chat' }),
  ).toEqual([])
})

/** Sends `prompt` and runs the reply, returning what the model was sent. */
async function send(
  t: Awaited<ReturnType<typeof setup>>['t'],
  run: () => Promise<unknown>,
) {
  calls.length = 0
  await run()
  vi.runAllTimers()
  vi.useRealTimers()
  await t.finishInProgressScheduledFunctions()
  vi.useFakeTimers()
  return JSON.stringify(calls)
}

test('built-in commands work in every workspace without being saved', async () => {
  const { t, asAda, projectId } = await setup()
  const sent = await send(t, () =>
    asAda.mutation(api.api.chat.sendMessage, {
      projectId,
      prompt: '/posts our launch week',
    }),
  )
  expect(sent).toContain('The user ran the /posts command.')
  expect(sent).toContain('one for each of X, Reddit and Discord')
})

test('a Library command with the same name replaces the built-in', async () => {
  const { t, asAda, projectId } = await setup()
  await asAda.action(api.api.commands.save, {
    projectId,
    name: 'posts',
    description: 'My posts.',
    markdown: 'Only write for Mastodon.',
  })
  const sent = await send(t, () =>
    asAda.mutation(api.api.chat.sendMessage, {
      projectId,
      prompt: '/posts our launch week',
    }),
  )
  expect(sent).toContain('Only write for Mastodon.')
  expect(sent).not.toContain('one for each of X, Reddit and Discord')
})

test('bots follow commands too', async () => {
  const { t, asAda, projectId } = await setup()
  const botId = await asAda.mutation(api.api.bots.save, {
    projectId,
    name: 'Ivy',
    role: 'Writer',
    instructions: 'You write.',
  })
  const sent = await send(t, () =>
    asAda.mutation(api.api.chat.sendMessage, {
      projectId,
      botId,
      prompt: '/standup now',
    }),
  )
  expect(sent).toContain('You are Ivy')
  expect(sent).toContain('List each bot with its top priority.')
})

test('/create works out what to make, with save_command among its tools', async () => {
  const { t, asAda, projectId } = await setup()
  const sent = await send(t, () =>
    asAda.mutation(api.api.chat.sendMessage, {
      projectId,
      prompt: '/create a weekly update command for the team',
    }),
  )
  expect(sent).toContain('The user ran the /create command.')
  expect(sent).toContain('a reusable command (save_command)')
  expect(sent).toContain('"save_command"')
})
