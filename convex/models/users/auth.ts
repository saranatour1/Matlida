import { setupEmailPassword } from '@convex-dev/auth/methods/email-password/server'
import { setupGithub } from '@convex-dev/auth/methods/github/server'
import { setupGoogle } from '@convex-dev/auth/methods/google/server'
import { setupConvexAuth } from '@convex-dev/auth/server'
import { components, internal } from '../../_generated/api'
import { env } from '../../_generated/server'
import { enabledMethods } from '../../lib/authMethods'
import type { AuthMethod } from '../../lib/authMethods'

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
    // ponytail: optional so a deployment runs without them; sign-up and reset emails fail until they're set.
    apiKey: env.RESEND_API_KEY ?? '',
    from: env.AUTH_EMAIL_FROM ?? '',
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

const methods = enabledMethods(env.AUTH_METHODS)

/**
 * `fn` on deployments where `method` is on (AUTH_METHODS), and nothing
 * elsewhere: a function exported as undefined isn't registered, so it can't
 * be called at all, whatever the page shows.
 */
const only = <T>(method: AuthMethod, fn: T) =>
  (methods.includes(method) ? fn : undefined) as T

export const authApi = {
  signOut,
  refreshSession,
  isAuthenticated,
  signUpWithEmailPassword: only('email', signUpWithEmailPassword),
  completeSignUp: only('email', completeSignUp),
  signInWithEmailPassword: only('email', signInWithEmailPassword),
  startPasswordRecovery: only('email', startPasswordRecovery),
  checkPasswordRecovery: only('email', checkPasswordRecovery),
  completePasswordRecovery: only('email', completePasswordRecovery),
  startSignInWithGoogle: only('google', google.startSignInWithGoogle),
  completeSignInWithGoogle: only('google', google.completeSignInWithGoogle),
  startSignInWithGithub: only('github', github.startSignInWithGithub),
  completeSignInWithGithub: only('github', github.completeSignInWithGithub),
}
