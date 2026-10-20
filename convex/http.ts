import { httpRouter } from 'convex/server'
import { spectrum } from './models/texts/spectrum'

const http = httpRouter()

// POST /spectrum/webhook, for Photon's inbound messages.
spectrum.registerRoutes(http)

export default http
