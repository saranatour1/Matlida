import { afterEach, expect, test, vi } from 'vitest'
import { FLAGS, flagOn } from '../../lib/flags'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

test('phone calls are off without the Worker set up, and when it fails', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect(await flagOn(FLAGS.phoneCalls, 'user_1')).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
  vi.stubEnv('FLAGS_SECRET', 'shh')
  fetch.mockResolvedValue(new Response('Not found', { status: 404 }))
  expect(await flagOn(FLAGS.phoneCalls, 'user_1')).toBe(false)
  fetch.mockRejectedValue(new Error('offline'))
  expect(await flagOn(FLAGS.phoneCalls, 'user_1')).toBe(false)
})

test('a deployment can turn them on for everyone, without Flagship', async () => {
  vi.stubGlobal('fetch', vi.fn())
  vi.stubEnv('FLAGS_ON', 'other, phone-calls')
  expect(await flagOn(FLAGS.phoneCalls, 'user_1')).toBe(true)
})

test("the Worker's Flagship binding turns them on for one user", async () => {
  vi.stubEnv('FLAGS_SECRET', 'shh')
  vi.stubEnv('FLAGS_URL', 'https://matilda.example')
  const fetch = vi.fn(() => Promise.resolve(Response.json({ on: true })))
  vi.stubGlobal('fetch', fetch)
  expect(await flagOn(FLAGS.phoneCalls, 'user_1')).toBe(true)
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://matilda.example/api/flags')
  expect(init.headers).toMatchObject({ authorization: 'Bearer shh' })
  expect(JSON.parse(init.body as string)).toEqual({
    flag: 'phone-calls',
    userId: 'user_1',
  })
  fetch.mockResolvedValue(Response.json({ on: false }))
  expect(await flagOn(FLAGS.phoneCalls, 'user_1')).toBe(false)
})
