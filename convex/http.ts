import { httpRouter } from 'convex/server'
import { photonWebhook } from './models/texts/webhook'

const http = httpRouter()

// POST /photon/webhook, for Photon's platform API: Telegram, and email arriving.
http.route({ path: '/photon/webhook', method: 'POST', handler: photonWebhook })

export default http
