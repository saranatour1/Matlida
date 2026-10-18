import { setupEmailPassword } from '@convex-dev/auth/methods/email-password/server'
import { setupGithub } from '@convex-dev/auth/methods/github/server'
import { setupGoogle } from '@convex-dev/auth/methods/google/server'
import { setupConvexAuth } from '@convex-dev/auth/server'
import { components, internal } from '../../_generated/api'
import { env } from '../../_generated/server'

/** SITE_URL without any trailing slash or path. */
const siteUrl = new URL(env.SITE_URL).origin

const core = setupConvexAuth({ component: components.auth })
const { signOut, refreshSession, isAuthenticated } = core

const callbacks = {
  createUser: internal.api.users.createUser,
  onSignIn: internal.api.users.syncProfile,
}

const {
  signUpWithEmailPassword,
  completeSignUp,
  signInWithEmailPassword,
  startPasswordRecovery,
  checkPasswordRecovery,
  completePasswordRecovery,
} = setupEmailPassword(core, {
  component: components.authEmail,
  passwordComponent: components.authPassword,
  emailSender: {
    kind: 'resend',
    sendEmail: components.resend.lib.sendEmail,
    apiKey: env.RESEND_API_KEY,
    from: env.AUTH_EMAIL_FROM,
  },
  urls: {
    signUp: `${siteUrl}/verify-email`,
    recovery: `${siteUrl}/reset-password`,
    // ponytail: changing email isn't exposed yet, so this link is never sent.
    changeEmail: siteUrl,
  },
}).attachUserCallbacks(callbacks)

const google = setupGoogle(core, {
  component: components.authGoogle,
  allowedRedirectOrigins: [siteUrl],
}).attachUserCallbacks(callbacks)

const github = setupGithub(core, {
  component: components.authGithub,
  allowedRedirectOrigins: [siteUrl],
}).attachUserCallbacks(callbacks)

export const authApi = {
  signOut,
  refreshSession,
  isAuthenticated,
  signUpWithEmailPassword,
  completeSignUp,
  signInWithEmailPassword,
  startPasswordRecovery,
  checkPasswordRecovery,
  completePasswordRecovery,
  ...google,
  ...github,
}
