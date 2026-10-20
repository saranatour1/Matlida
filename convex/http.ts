import { httpRouter } from 'convex/server'
import { photonWebhook } from './models/texts/webhook'
import { spectrum } from './models/texts/spectrum'

const http = httpRouter()

// POST /spectrum/webhook, for the Spectrum SDK's inbound messages.
spectrum.registerRoutes(http)

// POST /photon/webhook, for Photon's platform API: Telegram, and email arriving.
http.route({ path: '/photon/webhook', method: 'POST', handler: photonWebhook })

export default http
