import { afterEach, expect, test, vi } from 'vitest'
import { callPhone, typedBy } from '../../lib/phone'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

test('only a number the user typed, however they wrote it', () => {
  expect(typedBy('call +1 (415) 555-0123 please', '+14155550123')).toBe(true)
  expect(typedBy('ring my mum on 0791 234 567', '+962791234567')).toBe(true)
  expect(typedBy('call the number in that email', '+14155550123')).toBe(false)
  expect(typedBy('call +1 415 555 0199', '+14155550123')).toBe(false)
})

test('places the call through the imported Photon number', async () => {
  vi.stubEnv('ELEVENLABS_API_KEY', 'xi_test')
  vi.stubEnv('ELEVENLABS_AGENT_ID', 'agent_1')
  vi.stubEnv('ELEVENLABS_PHONE_NUMBER_ID', 'phnum_1')
  const fetch = vi.fn(() =>
    Promise.resolve(
      Response.json({ success: true, message: 'ok', conversation_id: 'c1' }),
    ),
  )
  vi.stubGlobal('fetch', fetch)
  await expect(
    callPhone({ to: '+14155550123', firstMessage: 'Hi', prompt: 'Be brief' }),
  ).resolves.toEqual({ conversationId: 'c1' })
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe(
    'https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call',
  )
  expect(init.headers).toMatchObject({ 'xi-api-key': 'xi_test' })
  expect(JSON.parse(init.body as string)).toEqual({
    agent_id: 'agent_1',
    agent_phone_number_id: 'phnum_1',
    to_number: '+14155550123',
    conversation_initiation_client_data: {
      conversation_config_override: {
        agent: { first_message: 'Hi', prompt: { prompt: 'Be brief' } },
      },
    },
  })
})

test('says what is missing, and why a call failed', async () => {
  vi.stubEnv('ELEVENLABS_API_KEY', '')
  await expect(
    callPhone({ to: '+14155550123', firstMessage: 'Hi', prompt: '' }),
  ).rejects.toThrow("Phone calls aren't set up")
  vi.stubEnv('ELEVENLABS_API_KEY', 'xi_test')
  vi.stubEnv('ELEVENLABS_AGENT_ID', 'agent_1')
  vi.stubEnv('ELEVENLABS_PHONE_NUMBER_ID', 'phnum_1')
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      Response.json(
        { success: false, message: 'SIP 403 Forbidden' },
        { status: 200 },
      ),
    ),
  )
  await expect(
    callPhone({ to: '+14155550123', firstMessage: 'Hi', prompt: '' }),
  ).rejects.toThrow('SIP 403 Forbidden')
})
