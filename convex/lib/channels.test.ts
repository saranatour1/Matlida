import { expect, test } from 'vitest'
import { CHANNELS, channelStatus } from './channels'
import type { Channel, ChannelFacts } from './channels'

const nothing: ChannelFacts = { env: [], linked: [], mailbox: null }

const telegramEnv = [
  'PHOTON_PROJECT_ID',
  'PHOTON_API_KEY',
  'PHOTON_WEBHOOK_SECRET',
] as const

function channel(id: Channel['id']) {
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
  // An old WhatsApp link doesn't count for Telegram.
  expect(
    channelStatus(channel('telegram'), {
      ...nothing,
      env: [...telegramEnv],
      linked: ['whatsapp_business'],
    }),
  ).toMatchObject({ status: 'ready' })
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

test('tools are always on, and planned channels are coming soon', () => {
  expect(channelStatus(channel('web_search'), nothing)).toEqual({
    status: 'connected',
    detail: 'perplexity/sonar',
    missing: [],
  })
  expect(channelStatus(channel('phone'), nothing)).toMatchObject({
    status: 'coming_soon',
  })
})
