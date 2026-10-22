import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import agent from '@convex-dev/agent/convex.config.js'
import auth from '@convex-dev/auth/convex.config.js'
import authEmail from '@convex-dev/auth/components/email/convex.config.js'
import authGithub from '@convex-dev/auth/components/github/convex.config.js'
import authGoogle from '@convex-dev/auth/components/google/convex.config.js'
import authPassword from '@convex-dev/auth/components/password/convex.config.js'
import aiBudget from '@convex-dev/ai-budget/convex.config'
import crons from '@convex-dev/crons/convex.config.js'
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js'
import resend from '@convex-dev/resend/convex.config.js'
import workflow from '@convex-dev/workflow/convex.config.js'
import spectrum from '@spectrum-ts/convex/convex.config.js'
import shopping from './components/shopping/convex.config'
import study from './components/study/convex.config'

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
    /** The sign-in methods this deployment offers, as a comma list of email, google and github. Unset means all; production sets github. Read at deploy time: redeploy after changing it. */
    AUTH_METHODS: v.optional(v.string()),
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
    /** Phone calls: the line they ring from, like +14155550123, and its Voice profile's outbound SIP credential (Voice → profile → Outbound calls in Photon). */
    PHOTON_PHONE_NUMBER: v.optional(v.string()),
    PHOTON_SIP_USERNAME: v.optional(v.string()),
    PHOTON_SIP_PASSWORD: v.optional(v.string()),
    /** The server under SIP connection on that profile. sip.photon.codes when unset. */
    PHOTON_SIP_HOST: v.optional(v.string()),
    /** Feature flags live in Cloudflare Flagship, read by the Worker's binding at /api/flags. This secret is shared with the Worker, so only Convex gets answers. Unset means every flag is off. */
    FLAGS_SECRET: v.optional(v.string()),
    /** Where the Worker is, when it isn't SITE_URL: dev's SITE_URL is localhost, which Convex can't reach, so dev sets https://matilda-is-a-bot.app. */
    FLAGS_URL: v.optional(v.string()),
    /** Flags on for everyone on this deployment, as a comma list, like phone-calls on dev. Never set it on prod. */
    FLAGS_ON: v.optional(v.string()),
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
app.use(study)
app.use(workflow)
app.use(crons)
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
