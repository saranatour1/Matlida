import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

/**
 * Only what has to run on a timer. Everything else is scheduled for when
 * it's due: check-ins after you chat, each watched price daily, each daily
 * briefing at its hour, each kept-up-to-date page when due. Email comes in
 * when you ask (and through Photon's webhook), Telegram through Spectrum's.
 */
const crons = cronJobs()

crons.interval(
  'sweep unsaved files',
  { hours: 24 },
  internal.api.commands.sweepFiles,
)

export default crons
