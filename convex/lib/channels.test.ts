import { expect, test } from 'vitest'
import { CHANNELS, channelStatus, messagingAppName } from './channels'
import type { Channel, ChannelFacts } from './channels'

const nothing: ChannelFacts = { env: [], linked: [], mailbox: null }

const photonEnv = [
  'SPECTRUM_PROJECT_ID',
  'SPECTRUM_PROJECT_SECRET',
  'SPECTRUM_WEBHOOK_SECRET',
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
      'Set SPECTRUM_PROJECT_ID, SPECTRUM_PROJECT_SECRET, SPECTRUM_WEBHOOK_SECRET, TELEGRAM_BOT_TOKEN on the Convex deployment.',
    missing: [...photonEnv, 'TELEGRAM_BOT_TOKEN'],
  })
  expect(
    channelStatus(channel('telegram'), {
      ...nothing,
      env: [...photonEnv, 'TELEGRAM_BOT_TOKEN'],
    }),
  ).toMatchObject({ status: 'ready', missing: [] })
  expect(
    channelStatus(channel('telegram'), {
      ...nothing,
      env: [...photonEnv, 'TELEGRAM_BOT_TOKEN'],
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

test('email is connected once an address is claimed', () => {
  expect(channelStatus(channel('email'), nothing)).toMatchObject({
    status: 'needs_setup',
    missing: ['MAIL_DOMAIN', 'RESEND_API_KEY'],
  })
  const env = ['MAIL_DOMAIN', 'RESEND_API_KEY'] as const
  expect(channelStatus(channel('email'), { ...nothing, env })).toMatchObject({
    status: 'ready',
  })
  expect(
    channelStatus(channel('email'), {
      ...nothing,
      env,
      mailbox: 'ada@example.com',
    }),
  ).toEqual({ status: 'connected', detail: 'ada@example.com', missing: [] })
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

test('Photon apps are named from the registry', () => {
  expect(messagingAppName('whatsapp_business')).toBe('WhatsApp')
  expect(messagingAppName('imessage')).toBe('iMessage')
  expect(messagingAppName('signal')).toBe('signal')
})
