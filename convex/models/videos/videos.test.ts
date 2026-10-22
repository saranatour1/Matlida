import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'
import type * as Ai from 'ai'

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/ai', () => ({ videoModel: {} }))

const made = vi.hoisted(() => ({ fail: false }))
vi.mock('ai', async (original) => ({
  ...(await original<typeof Ai>()),
  experimental_generateVideo: vi.fn(() =>
    made.fail
      ? Promise.reject(new Error('The prompt was blocked.'))
      : Promise.resolve({
          video: {
            uint8Array: new Uint8Array([1, 2, 3]),
            mediaType: 'video/mp4',
          },
          providerMetadata: { convexGateway: { cost: 0.8 } },
        }),
  ),
}))

afterEach(() => {
  made.fail = false
  vi.useRealTimers()
})

async function setup() {
  vi.useFakeTimers()
  const t = convexTest(schema, modules)
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
  const start = () =>
    t.mutation(internal.api.videos.start, {
      projectId,
      threadId: 'thread-1',
      prompt: 'A fox in the snow',
      shape: 'wide',
    })
  // A minute at a time, so the video is made long before the give-up.
  const run = () =>
    t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(60_000))
  return { t, asAda, asBob: t.withIdentity({ subject: bob }), start, run }
}

test('a video works in the background, then lands in storage for its owner only', async () => {
  const { t, asAda, asBob, start, run } = await setup()
  const id = await start()
  expect(await asAda.query(api.api.videos.get, { id })).toMatchObject({
    status: 'working',
    url: null,
  })
  await run()
  const video = await asAda.query(api.api.videos.get, { id })
  // The give-up timer ran too, and left the finished video alone.
  expect(video).toMatchObject({ status: 'done' })
  expect(video?.url).toMatch(/^https?:/)
  expect(await asBob.query(api.api.videos.get, { id })).toBeNull()
  expect(await t.run((ctx) => ctx.db.query('usage').take(10))).toMatchObject([
    { kind: 'media', label: 'Video', aiCost: 0.8 },
  ])
})

test('a failed video says why', async () => {
  const { asAda, start, run } = await setup()
  made.fail = true
  const id = await start()
  await run()
  expect(await asAda.query(api.api.videos.get, { id })).toMatchObject({
    status: 'failed',
    error: 'The prompt was blocked.',
  })
})

test('finishing converges: a late file still lands, and nothing undoes a done video', async () => {
  const { t, asAda, start } = await setup()
  const id = await start()
  const finish = (args: {
    storageId?: Awaited<ReturnType<typeof store>>
    error?: string
  }) => t.mutation(internal.api.videos.finish, { id, ...args })
  const store = () =>
    t.run((ctx) => ctx.storage.store(new Blob(['mp4'], { type: 'video/mp4' })))

  await finish({ error: 'It took too long. Try again.' })
  expect(await asAda.query(api.api.videos.get, { id })).toMatchObject({
    status: 'failed',
  })
  const storageId = await store()
  await finish({ storageId })
  await finish({ storageId })
  await finish({ error: 'It took too long. Try again.' })
  expect(await asAda.query(api.api.videos.get, { id })).toMatchObject({
    status: 'done',
    storageId,
  })
})
