import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// ponytail: checks every minute because Photon's beta webhooks don't document
// their signature yet. Move to its webhook once they do, for instant replies.
crons.interval('check email', { minutes: 1 }, internal.api.emails.poll)

// ponytail: a backstop for /photon/webhook, which Photon hasn't delivered to yet.
// Drop it once the webhook is seen answering Telegram.
crons.interval('check telegram', { minutes: 1 }, internal.api.texts.poll, {})

// The mail domain's DMARC record, shown on Connections.
crons.daily(
  'check mail domain',
  { hourUTC: 6 },
  internal.api.mailboxes.checkDomain,
  {},
)

export default crons
