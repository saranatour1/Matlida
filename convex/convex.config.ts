import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import agent from '@convex-dev/agent/convex.config.js'
import auth from '@convex-dev/auth/convex.config.js'
import authEmail from '@convex-dev/auth/components/email/convex.config.js'
import authGithub from '@convex-dev/auth/components/github/convex.config.js'
import authGoogle from '@convex-dev/auth/components/google/convex.config.js'
import authPassword from '@convex-dev/auth/components/password/convex.config.js'
import resend from '@convex-dev/resend/convex.config.js'
import spectrum from '@spectrum-ts/convex/convex.config.js'

const app = defineApp({
  env: {
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    /** The app's origin, e.g. http://localhost:3000. Email links and OAuth redirects point here. */
    SITE_URL: v.string(),
    RESEND_API_KEY: v.string(),
    /** e.g. "Matilda <auth@example.com>", on a domain verified with Resend. */
    AUTH_EMAIL_FROM: v.string(),
    AUTH_GOOGLE_CLIENT_ID: v.string(),
    AUTH_GOOGLE_CLIENT_SECRET: v.string(),
    AUTH_GITHUB_CLIENT_ID: v.string(),
    AUTH_GITHUB_CLIENT_SECRET: v.string(),
    /** Photon (messaging). Read by the Photon component's webhook route and sender, so they stay optional until messaging is set up. */
    SPECTRUM_WEBHOOK_SECRET: v.optional(v.string()),
    SPECTRUM_PROJECT_ID: v.optional(v.string()),
    SPECTRUM_PROJECT_SECRET: v.optional(v.string()),
    /** The Telegram bot's token from @BotFather, for replies on Telegram. */
    TELEGRAM_BOT_TOKEN: v.optional(v.string()),
  },
})

app.use(agent)
app.use(spectrum)
app.use(resend)
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
