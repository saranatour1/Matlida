import { afterEach, expect, test, vi } from 'vitest'
import { FLAGS, flagOn } from '../../lib/flags'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const setUp = () => {
  vi.stubEnv('FLAGSHIP_ACCOUNT_ID', 'acct')
  vi.stubEnv('FLAGSHIP_APP_ID', 'app')
  vi.stubEnv('FLAGSHIP_API_TOKEN', 'token')
}

test('phone calls are off without Flagship, and when it fails', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect(await flagOn(FLAGS.phoneCalls, 'user_1')).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
  setUp()
  fetch.mockResolvedValue(new Response('nope', { status: 500 }))
  expect(await flagOn(FLAGS.phoneCalls, 'user_1')).toBe(false)
  fetch.mockRejectedValue(new Error('offline'))
  expect(await flagOn(FLAGS.phoneCalls, 'user_1')).toBe(false)
})

test('Flagship turns them on for one user', async () => {
  setUp()
  const fetch = vi.fn(() =>
    Promise.resolve(Response.json({ result: { value: true } })),
  )
  vi.stubGlobal('fetch', fetch)
  expect(await flagOn(FLAGS.phoneCalls, 'user_1')).toBe(true)
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe(
    'https://api.cloudflare.com/client/v4/accounts/acct/flagship/apps/app/evaluate',
  )
  expect(JSON.parse(init.body as string)).toEqual({
    flagKey: 'phone-calls',
    context: { targetingKey: 'user_1' },
  })
  fetch.mockResolvedValue(Response.json({ value: false }))
  expect(await flagOn(FLAGS.phoneCalls, 'user_1')).toBe(false)
})
