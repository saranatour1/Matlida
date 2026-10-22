import { expect, test } from 'vitest'
import { CHANNELS, channelStatus, messagingAppName } from '../../lib/channels'
import type { Channel, ChannelFacts } from '../../lib/channels'

const nothing: ChannelFacts = { env: [], linked: [], mailbox: null }

const photonEnv = [
  'SPECTRUM_PROJECT_ID',
  'SPECTRUM_PROJECT_SECRET',
  'SPECTRUM_WEBHOOK_SECRET',
] as const

const telegramEnv = [
  'PHOTON_PROJECT_ID',
  'PHOTON_API_KEY',
  'PHOTON_WEBHOOK_SECRET',
] as const

const channel = (id: Channel['id']) => {
  const found = CHANNELS.find((c) => c.id === id)
  if (!found) throw new Error(`No channel ${id}`)
  return found
}

test('every channel has its own id', () => {
  const ids = CHANNELS.map((c) => c.id)
  expect(new Set(ids).size).toBe(ids.length)
})

test('a Photon app needs the deployment set up, then a linked chat', () => {
  expect(channelStatus(channel('telegram'), nothing)).toEqual({
    status: 'needs_setup',
    detail:
      'Set PHOTON_PROJECT_ID, PHOTON_API_KEY, PHOTON_WEBHOOK_SECRET on the Convex deployment.',
    missing: [...telegramEnv],
  })
  expect(
    channelStatus(channel('telegram'), {
      ...nothing,
      env: [...telegramEnv],
    }),
  ).toMatchObject({ status: 'ready', missing: [] })
  expect(
    channelStatus(channel('telegram'), {
      ...nothing,
      env: [...telegramEnv],
      linked: ['telegram'],
    }),
  ).toMatchObject({ status: 'connected' })
  // A WhatsApp link doesn't count for iMessage.
  expect(
    channelStatus(channel('imessage'), {
      ...nothing,
      env: [...photonEnv],
      linked: ['whatsapp_business'],
    }),
  ).toMatchObject({ status: 'ready' })
})

test('Photon apps are named from the registry', () => {
  expect(messagingAppName('whatsapp_business')).toBe('WhatsApp')
  expect(messagingAppName('imessage')).toBe('iMessage')
  expect(messagingAppName('signal')).toBe('signal')
})

test('email is connected once an address is claimed', () => {
  expect(channelStatus(channel('email'), nothing)).toMatchObject({
    status: 'needs_setup',
    missing: ['MAIL_DOMAIN', 'PHOTON_PROJECT_ID', 'PHOTON_API_KEY'],
  })
  const env = ['MAIL_DOMAIN', 'PHOTON_PROJECT_ID', 'PHOTON_API_KEY'] as const
  expect(channelStatus(channel('email'), { ...nothing, env })).toMatchObject({
    status: 'ready',
  })
  expect(
    channelStatus(channel('email'), {
      ...nothing,
      env,
      mailbox: { address: 'ada@example.com', here: true },
    }),
  ).toEqual({ status: 'connected', detail: 'ada@example.com', missing: [] })
  expect(
    channelStatus(channel('email'), {
      ...nothing,
      env,
      mailbox: { address: 'ada@example.com', here: false },
    }),
  ).toMatchObject({
    status: 'ready',
    detail: 'ada@example.com answers in another workspace.',
  })
})

test('tools are always on', () => {
  expect(channelStatus(channel('web_search'), nothing)).toEqual({
    status: 'connected',
    detail: 'perplexity/sonar',
    missing: [],
  })
})

test('phone calls work once ElevenLabs is set up', () => {
  expect(channelStatus(channel('phone'), nothing)).toMatchObject({
    status: 'needs_setup',
  })
  expect(
    channelStatus(channel('phone'), {
      ...nothing,
      env: [
        'ELEVENLABS_API_KEY',
        'ELEVENLABS_AGENT_ID',
        'ELEVENLABS_PHONE_NUMBER_ID',
      ],
    }),
  ).toMatchObject({ status: 'connected' })
})
