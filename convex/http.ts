import { httpRouter } from 'convex/server'
import { receiveResendEvent } from './models/inbound/webhook'
import { spectrum } from './models/texts/spectrum'

const http = httpRouter()

// POST /spectrum/webhook, for Photon's inbound messages.
spectrum.registerRoutes(http)

// POST /resend/inbound, for email to the users' assistant addresses.
http.route({
  path: '/resend/inbound',
  method: 'POST',
  handler: receiveResendEvent,
})

export default http
