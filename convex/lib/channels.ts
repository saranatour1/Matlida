import { MODELS } from './models'
import type { env } from '../_generated/server'

/** A deployment env var a channel can need. Names only, so the browser can say what's missing. */
export type EnvName = keyof typeof env

export type ChannelId =
  | 'email'
  | 'imessage'
  | 'telegram'
  | 'whatsapp'
  | 'phone'
  | 'web_search'
  | 'research'
  | 'voice_input'
  | 'voice_replies'

/**
 * One way to reach the assistants, or one tool they come with. `via` says how
 * it works, and decides how its status is computed:
 * - `photon`: a messaging app linked through Photon's webhook.
 * - `email`: the user's address at `MAIL_DOMAIN`.
 * - `tool`: always on, through the Convex AI gateway.
 * - `planned`: shown as coming soon, with the reason.
 */
export type Channel = {
  id: ChannelId
  name: string
  description: string
  /** Deployment env vars it needs. Connections shows which are missing, never their values. */
  env: ReadonlyArray<EnvName>
} & (
  | { via: 'photon'; platform: 'imessage' | 'telegram' | 'whatsapp_business' }
  | { via: 'email' }
  | { via: 'tool'; model: string }
  | { via: 'planned'; note: string }
)

const PHOTON_ENV = [
  'SPECTRUM_PROJECT_ID',
  'SPECTRUM_PROJECT_SECRET',
  'SPECTRUM_WEBHOOK_SECRET',
] as const

/**
 * Every channel the app supports, in the order Connections shows them. Adding
 * one is one entry here: Connections, the details panel, the command menu and
 * the Messaging page all read this list.
 */
export const CHANNELS: ReadonlyArray<Channel> = [
  {
    id: 'email',
    name: 'Email',
    via: 'email',
    description:
      'Email an assistant from your sign-in address and get a reply by email.',
    env: ['MAIL_DOMAIN', 'PHOTON_PROJECT_ID', 'PHOTON_API_KEY'],
  },
  {
    id: 'imessage',
    name: 'iMessage',
    via: 'photon',
    platform: 'imessage',
    description:
      "Text through a Photon line. Reaches SMS and RCS phones too: Photon falls back when iMessage isn't available.",
    env: PHOTON_ENV,
  },
  {
    id: 'telegram',
    name: 'Telegram',
    via: 'photon',
    platform: 'telegram',
    description:
      "Message your Telegram bot. It's connected in Photon's dashboard, and messages arrive at /photon/webhook.",
    env: ['PHOTON_PROJECT_ID', 'PHOTON_API_KEY', 'PHOTON_WEBHOOK_SECRET'],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    via: 'photon',
    platform: 'whatsapp_business',
    description: 'Message a WhatsApp Business number, through Photon.',
    env: PHOTON_ENV,
  },
  {
    id: 'phone',
    name: 'Phone calls',
    via: 'planned',
    note: "Photon's voice line is SIP only, with no call control from a Convex action yet. Calls in the app work today.",
    description: 'Real phone calls with an assistant.',
    env: [],
  },
  {
    id: 'web_search',
    name: 'Web search',
    via: 'tool',
    model: MODELS.search,
    description: 'Current facts from the web, in every chat.',
    env: [],
  },
  {
    id: 'research',
    name: 'Research',
    via: 'tool',
    model: MODELS.research,
    description: 'Longer briefs across many sources.',
    env: [],
  },
  {
    id: 'voice_input',
    name: 'Voice input',
    via: 'tool',
    model: MODELS.transcription,
    description: 'The mic button and calls, transcribed on the server.',
    env: [],
  },
  {
    id: 'voice_replies',
    name: 'Voice replies',
    via: 'tool',
    model: MODELS.speech,
    description: 'Spoken replies on calls.',
    env: [],
  },
]

export type ChannelStatus =
  'connected' | 'ready' | 'needs_setup' | 'coming_soon'

export const STATUS_LABELS: Record<ChannelStatus, string> = {
  connected: 'Connected',
  ready: 'Ready to link',
  needs_setup: 'Needs deployment setup',
  coming_soon: 'Coming soon',
}

/** What a project has, for `channelStatus`. Computed on the server from existing data. */
export type ChannelFacts = {
  /** The env vars that are set on the deployment, out of the ones the channels need. */
  env: ReadonlyArray<EnvName>
  /** Photon apps (`platform`) with a linked chat. */
  linked: ReadonlyArray<string>
  /** The user's address at MAIL_DOMAIN once claimed, and whether this workspace answers it. */
  mailbox: { address: string; here: boolean } | null | null
}

/**
 * A channel's status for one project, with a line to show under it and the
 * env vars still missing. Pure, so the rules are tested without a database.
 */
export function channelStatus(
  channel: Channel,
  facts: ChannelFacts,
): { status: ChannelStatus; detail: string; missing: Array<EnvName> } {
  if (channel.via === 'planned') {
    return { status: 'coming_soon', detail: channel.note, missing: [] }
  }
  if (channel.via === 'tool') {
    return { status: 'connected', detail: channel.model, missing: [] }
  }
  const missing = channel.env.filter((name) => !facts.env.includes(name))
  if (missing.length > 0) {
    return {
      status: 'needs_setup',
      detail: `Set ${missing.join(', ')} on the Convex deployment.`,
      missing,
    }
  }
  if (channel.via === 'photon') {
    return facts.linked.includes(channel.platform)
      ? { status: 'connected', detail: 'A chat is linked.', missing }
      : {
          status: 'ready',
          detail: 'Link a chat from the Messaging page.',
          missing,
        }
  }
  if (!facts.mailbox) {
    return { status: 'ready', detail: 'Claim an address.', missing }
  }
  return facts.mailbox.here
    ? { status: 'connected', detail: facts.mailbox.address, missing }
    : {
        status: 'ready',
        detail: `${facts.mailbox.address} answers in another workspace.`,
        missing,
      }
}

/** How a Photon messaging app is named in the app, by Photon's id for it. */
export function messagingAppName(platform: string) {
  const channel = CHANNELS.find(
    (c) => c.via === 'photon' && c.platform === platform,
  )
  return channel?.name ?? platform
}
