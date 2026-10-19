import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// The Resend component keeps every email it sent, replies to the users'
// assistant addresses included. A week is enough to debug delivery.
crons.interval(
  'forget old mail',
  { hours: 24 },
  internal.api.inbound.forgetOldMail,
  {},
)

export default crons
