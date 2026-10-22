import { httpRouter } from 'convex/server'
import { spectrum } from './models/texts/spectrum'
import { photonWebhook } from './models/texts/webhook'

const http = httpRouter()

// POST /spectrum/webhook, for the Spectrum SDK's inbound messages: iMessage, WhatsApp, Telegram.
spectrum.registerRoutes(http)

// POST /photon/webhook, for Photon's platform API: Telegram, and email arriving.
http.route({ path: '/photon/webhook', method: 'POST', handler: photonWebhook })

export default http
