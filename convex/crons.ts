import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

/**
 * Only what has to run on a timer. Everything else is scheduled for when
 * it's due: check-ins after you chat, each watched price daily, each daily
 * briefing at its hour, each kept-up-to-date page when due. Email comes in
 * when you ask (and through Photon's webhook).
 */
const crons = cronJobs()

// ponytail: a backstop for /photon/webhook, which Photon hasn't delivered to yet.
// Drop it once the webhook is seen answering Telegram.
crons.interval('check telegram', { minutes: 1 }, internal.api.texts.poll, {})

crons.interval(
  'sweep unsaved files',
  { hours: 24 },
  internal.api.commands.sweepFiles,
)

export default crons
