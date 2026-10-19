import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  return {
    languageModel: mockModel({
      content: [{ type: 'text', text: 'Hello from the lead.' }],
    }),
  }
})

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
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
  return { t, asAda, asBob: t.withIdentity({ subject: bob }), projectId }
}

const firstPage = { numItems: 10, cursor: null }

/** Runs the lead's scheduled reply. Its stream needs real timers, so fake ones only start it. */
async function finishReply(t: ReturnType<typeof convexTest>) {
  vi.runAllTimers()
  vi.useRealTimers()
  await t.finishInProgressScheduledFunctions()
}

test('a first message starts a chat and the lead replies in it', async () => {
  const { t, asAda, projectId } = await setup()

  const threadId = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    prompt: 'Hi there',
  })
  await finishReply(t)

  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId,
    paginationOpts: firstPage,
  })
  expect(
    page.map((m) => [m.role, m.text]).sort(([a], [b]) => a.localeCompare(b)),
  ).toEqual([
    ['assistant', 'Hello from the lead.'],
    ['user', 'Hi there'],
  ])
  expect(
    await asAda.query(api.api.threads.list, { projectId, kind: 'chat' }),
  ).toMatchObject([{ threadId, title: 'Hi there', kind: 'chat' }])
})

test("another user can't read or post to the chat", async () => {
  const { asAda, asBob, projectId } = await setup()
  const threadId = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    prompt: 'Private',
  })

  await expect(
    asBob.query(api.api.chat.listMessages, {
      threadId,
      paginationOpts: firstPage,
    }),
  ).rejects.toThrow('Chat not found.')
  await expect(
    asBob.mutation(api.api.chat.sendMessage, { projectId, prompt: 'Hi' }),
  ).rejects.toThrow('Project not found.')
})

test('a chat with a bot is listed under that bot, not the lead', async () => {
  const { t, asAda, projectId } = await setup()
  const botId = await asAda.mutation(api.api.bots.save, {
    projectId,
    name: 'Rex',
    role: 'Researcher',
    instructions: 'Find things out.',
  })

  const threadId = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    botId,
    prompt: 'Look into this',
  })
  await finishReply(t)

  expect(
    await asAda.query(api.api.threads.listForBot, { projectId, botId }),
  ).toMatchObject([{ threadId, botId, kind: 'chat' }])
  expect(await asAda.query(api.api.threads.listForBot, { projectId })).toEqual(
    [],
  )
  await expect(
    asAda.mutation(api.api.chat.sendMessage, {
      projectId,
      threadId,
      prompt: 'Lead, are you there?',
    }),
  ).rejects.toThrow('Chat not found.')
})

test("a bot from another workspace can't be messaged", async () => {
  const { asAda, projectId } = await setup()
  const otherProject = await asAda.mutation(api.api.projects.save, {
    name: 'Side',
    brief: '',
    guidelines: '',
  })
  const botId = await asAda.mutation(api.api.bots.save, {
    projectId: otherProject,
    name: 'Rex',
    role: 'Researcher',
    instructions: 'Find things out.',
  })

  await expect(
    asAda.mutation(api.api.chat.sendMessage, {
      projectId,
      botId,
      prompt: 'Hi',
    }),
  ).rejects.toThrow('Assistant not found.')
})

test('members decide who an assistant can hand work to', async () => {
  const { t, asAda, projectId } = await setup()
  const [rex, ivy] = await Promise.all(
    ['Rex', 'Ivy'].map((name) =>
      asAda.mutation(api.api.bots.save, {
        projectId,
        name,
        role: 'Helper',
        instructions: 'Help.',
      }),
    ),
  )
  const leadThread = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    prompt: 'Hi',
  })
  const rexThread = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    botId: rex,
    prompt: 'Hi',
  })
  const membersOf = async (threadId: string) =>
    (await t.query(internal.api.chat.context, { threadId })).members.map(
      (m) => m.name,
    )

  expect((await membersOf(leadThread)).sort()).toEqual(['Ivy', 'Rex'])
  expect(await membersOf(rexThread)).toEqual([])

  await asAda.mutation(api.api.threads.setMembers, {
    threadId: rexThread,
    memberIds: [ivy],
  })
  expect(await membersOf(rexThread)).toEqual(['Ivy'])
  await expect(
    asAda.mutation(api.api.threads.setMembers, {
      threadId: rexThread,
      memberIds: [rex],
    }),
  ).rejects.toThrow('Only other assistants in this workspace can join.')
})

test("a reply records its model usage and action time, visible only to the chat's owner", async () => {
  const { t, asAda, asBob, projectId } = await setup()
  const threadId = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    prompt: 'Hi there',
  })
  await finishReply(t)

  const usage = await asAda.query(api.api.usage.forThread, { threadId })
  expect(usage.map((u) => u.kind).sort()).toEqual(['compute', 'reply'])
  expect(usage.find((u) => u.kind === 'reply')).toMatchObject({
    label: 'Matilda',
  })
  expect(await asBob.query(api.api.usage.forThread, { threadId })).toEqual([])
})
