import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import agent from '@convex-dev/agent/convex.config'
import auth from '@convex-dev/auth/convex.config.js'
import authPassword from '@convex-dev/auth/components/password/convex.config.js'
import authUsername from '@convex-dev/auth/components/username/convex.config.js'

const app = defineApp({
  env: {
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    /** Base64 AES-256 key that encrypts users' email credentials (lib/crypto.ts). */
    SECRETS_KEY: v.string(),
  },
})

app.use(agent)
app.use(auth, {
  httpPrefix: '/auth',
  env: {
    AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
    AUTH_JWKS: app.env.AUTH_JWKS,
  },
})
app.use(authPassword)
app.use(authUsername)

export default app
