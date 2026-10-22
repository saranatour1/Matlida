import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import agent from '@convex-dev/agent/convex.config.js'
import auth from '@convex-dev/auth/convex.config.js'
import authEmail from '@convex-dev/auth/components/email/convex.config.js'
import authGithub from '@convex-dev/auth/components/github/convex.config.js'
import authGoogle from '@convex-dev/auth/components/google/convex.config.js'
import authPassword from '@convex-dev/auth/components/password/convex.config.js'
import aiBudget from '@convex-dev/ai-budget/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js'
import resend from '@convex-dev/resend/convex.config.js'
import workflow from '@convex-dev/workflow/convex.config.js'
import spectrum from '@spectrum-ts/convex/convex.config.js'
import shopping from './components/shopping/convex.config'

const app = defineApp({
  env: {
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    /** The app's origin, e.g. http://localhost:3000. Email links and OAuth redirects point here. */
    SITE_URL: v.string(),
    RESEND_API_KEY: v.string().optional(),
    /** e.g. "Matilda <auth@example.com>", on a domain verified with Resend. */
    AUTH_EMAIL_FROM: v.string().optional(),
    AUTH_GOOGLE_CLIENT_ID: v.string(),
    AUTH_GOOGLE_CLIENT_SECRET: v.string(),
    AUTH_GITHUB_CLIENT_ID: v.string(),
    AUTH_GITHUB_CLIENT_SECRET: v.string(),
    /** Photon's platform API (beta), which sends and receives the assistants' email and Telegram messages. Project id starts with pho_prj_; the key needs project:read and project:write. */
    PHOTON_PROJECT_ID: v.optional(v.string()),
    PHOTON_API_KEY: v.optional(v.string()),
    /** Photon texting through the Spectrum SDK (iMessage, WhatsApp, Telegram): its webhook route and sender read these, so they stay optional until texting is set up. */
    SPECTRUM_WEBHOOK_SECRET: v.optional(v.string()),
    SPECTRUM_PROJECT_ID: v.optional(v.string()),
    SPECTRUM_PROJECT_SECRET: v.optional(v.string()),
    /** The Telegram bot's token from @BotFather, for the Spectrum SDK's Telegram provider. */
    TELEGRAM_BOT_TOKEN: v.optional(v.string()),
    /** Signs Photon's platform webhook at /photon/webhook (whsec_…): Telegram messages, and email arriving. */
    PHOTON_WEBHOOK_SECRET: v.optional(v.string()),
    /** The domain of the users' assistant addresses (handle@MAIL_DOMAIN), connected on Photon's Email page. Unset until email is set up. */
    MAIL_DOMAIN: v.optional(v.string()),
    /** Each person's AI spend a month, in dollars. 12 when unset. */
    AI_BUDGET_USD: v.optional(v.string()),
  },
})

app.use(agent)
app.use(spectrum)
app.use(resend)
app.use(rateLimiter)
app.use(aiBudget)
app.use(shopping)
app.use(workflow)
app.use(auth, {
  httpPrefix: '/auth',
  env: {
    AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
    AUTH_JWKS: app.env.AUTH_JWKS,
  },
})
app.use(authPassword)
app.use(authEmail)
app.use(authGoogle, {
  httpPrefix: '/oauth/google',
  env: {
    CLIENT_ID: app.env.AUTH_GOOGLE_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GOOGLE_CLIENT_SECRET,
  },
})
app.use(authGithub, {
  httpPrefix: '/oauth/github',
  env: {
    CLIENT_ID: app.env.AUTH_GITHUB_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GITHUB_CLIENT_SECRET,
  },
})

export default app
