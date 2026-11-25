import { httpRouter } from 'convex/server'
import { spectrum } from './models/texts/spectrum'
import { photon } from './models/texts/photon'

const http = httpRouter()

// POST /spectrum/webhook, for the Spectrum SDK's inbound messages: iMessage, WhatsApp, Telegram.
spectrum.registerRoutes(http)

// POST /photon/webhook, for Photon's platform API: Telegram, and email arriving.
photon.registerRoutes(http)

export default http
