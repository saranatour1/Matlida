import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

vi.mock('../../lib/budget', () => import('../../test.budget'))
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

test("a first message starts the lead's one chat and the lead replies in it", async () => {
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
  ).toMatchObject([{ threadId, title: 'Matilda', kind: 'chat' }])
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

test('each assistant has one chat, and messages keep going to it', async () => {
  const { t, asAda, projectId } = await setup()
  const botId = await asAda.mutation(api.api.bots.save, {
    projectId,
    name: 'Rex',
    role: 'Researcher',
    instructions: 'Find things out.',
  })

  const rexThread = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    botId,
    prompt: 'Look into this',
  })
  await finishReply(t)
  vi.useFakeTimers()
  const leadThread = await asAda.mutation(api.api.chat.sendMessage, {
    projectId,
    prompt: 'Hi',
  })

  expect(leadThread).not.toEqual(rexThread)
  expect(
    await asAda.mutation(api.api.chat.sendMessage, {
      projectId,
      botId,
      prompt: 'And this',
    }),
  ).toEqual(rexThread)
  expect(await asAda.query(api.api.threads.main, { projectId, botId })).toEqual(
    rexThread,
  )
  expect(await asAda.query(api.api.threads.main, { projectId })).toEqual(
    leadThread,
  )
})

test('the old app chat is found behind any number of channel chats, and recorded once', async () => {
  const { t, asAda, projectId } = await setup()
  const userId = (await t.run((ctx) => ctx.db.query('users').first()))!._id
  const start = (title: string) =>
    t.mutation(internal.api.threads.start, {
      projectId,
      kind: 'chat',
      title,
      userId,
    })
  const appChat = await start('The app chat')
  // 20 newer chats, all from messaging apps and email: eleven linked
  // phones, a mailbox, and the rest as a link's old bot chats.
  const channel: Array<string> = []
  for (let i = 0; i < 20; i++) channel.push(await start(`Channel ${i}`))
  const botId = await asAda.mutation(api.api.bots.save, {
    projectId,
    name: 'Rex',
    role: 'Researcher',
    instructions: 'Find things out.',
  })
  await t.run(async (ctx) => {
    for (let i = 0; i < 11; i++) {
      await ctx.db.insert('phoneLinks', {
        status: 'linked',
        ownerId: userId,
        projectId,
        spaceId: `space-${i}`,
        threadId: channel[i],
        ...(i === 0 && {
          botThreads: channel
            .slice(13)
            .map((threadId) => ({ botId, threadId })),
        }),
      })
    }
    await ctx.db.insert('mailboxes', {
      userId,
      projectId,
      handle: 'ada',
      threadId: channel[11],
      inboxThreadId: channel[12],
    })
    await ctx.db.patch('projects', projectId, { threadId: undefined })
  })
  // Even before the backfill, a message lands in the old chat, not a new one.
  expect(await asAda.query(api.api.threads.main, { projectId })).toEqual(
    appChat,
  )

  await t.mutation(internal.api.threads.recordMainThreads, { cursor: null })
  expect(await asAda.query(api.api.threads.main, { projectId })).toEqual(
    appChat,
  )
  // Rex has no chat yet, so the backfill leaves him to start one.
  expect(
    await asAda.query(api.api.threads.main, { projectId, botId }),
  ).toBeNull()

  // Running it again changes nothing, and messages go to the recorded chat.
  await t.mutation(internal.api.threads.recordMainThreads, { cursor: null })
  expect(
    await asAda.mutation(api.api.chat.sendMessage, { projectId, prompt: 'Hi' }),
  ).toEqual(appChat)
  expect(await asAda.query(api.api.threads.main, { projectId })).toEqual(
    appChat,
  )
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

test('no bots are members until you add them', async () => {
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

  expect(await membersOf(leadThread)).toEqual([])
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
