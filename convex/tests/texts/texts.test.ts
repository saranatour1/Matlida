import agentTest from '@convex-dev/agent/test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import spectrumTest from '@spectrum-ts/convex/test'
import { convexTest } from 'convex-test'
import { createFunctionHandle } from 'convex/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, components, internal } from '../../_generated/api'
import { languageModel } from '../../lib/ai'
import schema from '../../schema'
import { modules } from '../../test.setup'

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  return {
    languageModel: mockModel({
      content: [{ type: 'text', text: 'Hi from Matilda.' }],
    }),
  }
})

const delivered = vi.hoisted(
  () => [] as Array<{ spaceId: string; content?: unknown }>,
)

const sentOn = vi.hoisted(
  () => [] as Array<{ platform: string; spaceId: string; text: string }>,
)

/** A Photon provider whose spaces record what's sent to them. */
const fakeProvider = vi.hoisted(
  () => (platform: string) =>
    Object.assign(
      () => ({
        space: {
          get: (spaceId: string) =>
            Promise.resolve({
              send: (text: string) => {
                sentOn.push({ platform, spaceId, text })
                return Promise.resolve({ id: `${platform}-1` })
              },
            }),
        },
      }),
      { config: () => ({}) },
    ),
)

vi.mock('@spectrum-ts/core', () => ({ Spectrum: () => Promise.resolve({}) }))
vi.mock('@spectrum-ts/telegram', () => ({ telegram: fakeProvider('telegram') }))
vi.mock('@spectrum-ts/whatsapp-business', () => ({
  whatsappBusiness: fakeProvider('whatsapp_business'),
}))

vi.mock('@spectrum-ts/convex/sender', () => ({
  createCloudSender: () => ({
    deliver: (job: { spaceId: string; content?: unknown }) => {
      delivered.push(job)
      return Promise.resolve({ ok: true, providerMessageId: 'photon-1' })
    },
  }),
}))

const calls = (languageModel as unknown as { doGenerateCalls: Array<unknown> })
  .doGenerateCalls

beforeEach(() => {
  calls.length = 0
  delivered.length = 0
  sentOn.length = 0
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const setup = async () => {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  spectrumTest.register(t)
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
  // Photon's keys for the Telegram and WhatsApp replies; iMessage goes through the cloud sender.
  vi.stubEnv('SPECTRUM_PROJECT_ID', 'project')
  vi.stubEnv('SPECTRUM_PROJECT_SECRET', 'secret')
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '1:token')
  /** Texts `message` from `spaceId` through the Spectrum webhook's path, and returns the reply, or '' for none. */
  const text = async (
    spaceId: string,
    message: string,
    platform = 'telegram',
  ) => {
    if (!vi.isFakeTimers()) vi.useFakeTimers()
    const [before, beforeOn] = [delivered.length, sentOn.length]
    await arrive(t, spaceId, platform, message)
    const imessage = delivered.at(before)
    const other = sentOn.at(beforeOn)
    return imessage
      ? ((imessage.content as { text?: string } | undefined)?.text ?? '')
      : (other?.text ?? '')
  }
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
  const chat = await asAda.query(api.api.threads.main, { projectId })
  expect(chat).toBeTruthy()
  const { page } = await asAda.query(api.api.chat.listMessages, {
    threadId: chat ?? '',
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(page.map((m) => m.text).sort()).toEqual([
    'Hi from Matilda.',
    'What is on today?',
  ])
})

test('a linked owner who floods is asked to slow down, from any app', async () => {
  const { asAda, projectId, text } = await setup()
  vi.useFakeTimers()
  for (const [spaceId, platform] of [
    ['tg-1', 'telegram'],
    ['wa-1', 'whatsapp_business'],
  ] as const) {
    const code = await asAda.mutation(api.api.texts.startLink, { projectId })
    await text(spaceId, `link ${code}`, platform)
  }
  // Both chats count against the same owner: 15 in a row, then a pause.
  for (let i = 0; i < 15; i++) {
    expect(await text(i % 2 ? 'tg-1' : 'wa-1', `hi ${i}`)).toBe(
      'Hi from Matilda.',
    )
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

test('a project links one chat per app, and relinking an app replaces it', async () => {
  const { asAda, projectId, text } = await setup()
  const link = async (spaceId: string, platform: string) =>
    await text(
      spaceId,
      `link ${await asAda.mutation(api.api.texts.startLink, { projectId })}`,
      platform,
    )
  await link('imessage-1', 'imessage')
  await link('telegram-1', 'telegram')
  await link('telegram-2', 'telegram')

  const links = await asAda.query(api.api.texts.links, { projectId })
  expect(links.map((l) => l.status === 'linked' && l.spaceId).sort()).toEqual([
    'imessage-1',
    'telegram-2',
  ])
})

test('texts only ever go to the lead, even with @name', async () => {
  const { asAda, projectId, text } = await setup()
  const ivy = await asAda.mutation(api.api.bots.save, {
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
  expect(await asAda.query(api.api.threads.main, { projectId })).toBeTruthy()
  expect(
    await asAda.query(api.api.threads.main, { projectId, botId: ivy }),
  ).toBeNull()
})

test('find_texts searches what you texted from a linked chat, and only yours', async () => {
  const { t, ada, bob, asAda, projectId, text } = await setup()
  await text('tg-1', 'pick up the dry cleaning', 'telegram')
  const code = await asAda.mutation(api.api.texts.startLink, { projectId })
  await text('tg-1', `link ${code}`, 'telegram')
  await text('tg-1', 'Remind me about the dry cleaning on Friday', 'telegram')
  await text('tg-1', 'And book the dentist', 'telegram')
  const search = (userId: typeof ada, query: string, platform?: string) =>
    t.query(internal.api.texts.search, { userId, query, platform })

  expect(await search(ada, 'dry cleaning')).toMatchObject([
    {
      platform: 'telegram',
      text: 'Remind me about the dry cleaning on Friday',
    },
  ])
  expect(await search(ada, 'dentist', 'whatsapp_business')).toEqual([])
  expect(await search(ada, code)).toEqual([])
  expect(await search(bob, 'dentist')).toEqual([])
})

let arrivals = 0

/** Delivers `text` from `spaceId` the way the Spectrum webhook does, and runs the turn. */
const arrive = async (
  t: Awaited<ReturnType<typeof setup>>['t'],
  spaceId: string,
  platform: string,
  text: string,
  content: unknown = { type: 'text', text },
) => {
  await t.run(async (ctx) => {
    await ctx.runMutation(components.spectrum.inbound.enqueue, {
      spaceId,
      messageId: `${spaceId}-${text}-${arrivals++}`,
      platform,
      content,
      mode: 'collapse',
      onBatch: await createFunctionHandle(internal.api.texts.batch),
    })
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
}

test('a failed reply still texts back and closes the turn', async () => {
  const { t, asAda, projectId, text } = await setup()
  const code = await asAda.mutation(api.api.texts.startLink, { projectId })
  await text('space-1', `link ${code}`, 'imessage')
  vi.spyOn(languageModel, 'doGenerate').mockRejectedValueOnce(
    new Error('Gateway is down'),
  )
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})

  vi.useFakeTimers()
  await arrive(t, 'space-1', 'iMessage', 'What is on today?')

  expect(delivered.at(-1)).toMatchObject({
    spaceId: 'space-1',
    content: {
      type: 'text',
      text: 'Sorry, something went wrong. Try again in a minute.',
    },
  })
  expect(
    await t.query(components.spectrum.inbound.listMessages, {
      spaceId: 'space-1',
    }),
  ).toSatisfy((messages: Array<{ status: string }>) =>
    messages.every((m) => m.status === 'handled'),
  )
  expect(log.mock.calls.flat().map(String)).toContainEqual(
    expect.stringContaining('Gateway is down'),
  )
})

test('an ignored message sends nothing back and still closes the turn', async () => {
  const { t, text } = await setup()
  vi.useFakeTimers()
  for (let i = 0; i < 15; i++) await text('stranger', `hello ${i}`, 'imessage')
  const answered = delivered.length
  await arrive(t, 'stranger', 'iMessage', 'hello again')
  expect(delivered).toHaveLength(answered)
  expect(
    await t.query(components.spectrum.inbound.listMessages, {
      spaceId: 'stranger',
    }),
  ).toSatisfy((messages: Array<{ status: string }>) =>
    messages.every((m) => m.status === 'handled'),
  )
})

test('Telegram and WhatsApp chats link through the Spectrum webhook and get replies through their provider', async () => {
  const { t, asAda, projectId } = await setup()
  vi.stubEnv('SPECTRUM_PROJECT_ID', 'project')
  vi.stubEnv('SPECTRUM_PROJECT_SECRET', 'secret')
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '1:token')
  const chats = [
    ['tg-1', 'telegram'],
    ['wa-1', 'whatsapp_business'],
  ] as const
  vi.useFakeTimers()
  const receive = async (text: (spaceId: string) => Promise<string>) => {
    for (const [spaceId, platform] of chats) {
      await arrive(t, spaceId, platform, await text(spaceId))
    }
  }

  await receive(
    async () =>
      `link ${await asAda.mutation(api.api.texts.startLink, { projectId })}`,
  )
  const links = await asAda.query(api.api.texts.links, { projectId })
  expect(links.map((l) => l.status === 'linked' && l.platform).sort()).toEqual([
    'telegram',
    'whatsapp_business',
  ])

  sentOn.length = 0
  await receive(() => Promise.resolve('Hello?'))
  expect(delivered).toEqual([])
  expect(sentOn.sort((a, b) => a.spaceId.localeCompare(b.spaceId))).toEqual([
    { platform: 'telegram', spaceId: 'tg-1', text: 'Hi from Matilda.' },
    {
      platform: 'whatsapp_business',
      spaceId: 'wa-1',
      text: 'Hi from Matilda.',
    },
  ])
})

test('a text that replaces a queued reply means one answer, and the replaced turn never calls the model', async () => {
  const { t, asAda, projectId, text } = await setup()
  const code = await asAda.mutation(api.api.texts.startLink, { projectId })
  await text('space-1', `link ${code}`, 'imessage')
  const answered = delivered.length
  const send = (message: string) =>
    t.run(async (ctx) => {
      await ctx.runMutation(components.spectrum.inbound.enqueue, {
        spaceId: 'space-1',
        messageId: `burst-${message}`,
        platform: 'iMessage',
        content: { type: 'text', text: message },
        mode: 'collapse',
        onBatch: await createFunctionHandle(internal.api.texts.batch),
      })
    })
  await send('What is on today?')
  // The first burst is handed over and its reply queued, but not run yet.
  for (let i = 0; i < 2; i++) {
    vi.advanceTimersByTime(1)
    await t.finishInProgressScheduledFunctions()
  }
  await send('And tomorrow?')
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(calls).toHaveLength(1)
  expect(JSON.stringify(calls[0])).toContain('And tomorrow?')
  expect(delivered.slice(answered)).toMatchObject([
    { content: { text: 'Hi from Matilda.' } },
  ])
})

test('commands run on Telegram like in the app, and /start is a plain message', async () => {
  const { asAda, projectId, text } = await setup()
  const code = await asAda.mutation(api.api.texts.startLink, { projectId })
  await text('space-1', `link ${code}`)

  expect(await text('space-1', '/tldr@MatildaBot the meeting notes')).toBe(
    'Hi from Matilda.',
  )
  expect(JSON.stringify(calls)).toContain('after /tldr')
  calls.length = 0
  expect(await text('space-1', '/start')).toBe('Hi from Matilda.')
  expect(JSON.stringify(calls)).not.toContain('after /tldr')
})
