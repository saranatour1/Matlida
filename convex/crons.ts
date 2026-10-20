import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// ponytail: checks every minute because Photon's beta webhooks don't document
// their signature yet. Move to its webhook once they do, for instant replies.
crons.interval('check email', { minutes: 1 }, internal.api.emails.poll)

export default crons
