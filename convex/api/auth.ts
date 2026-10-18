import { authApi } from '../models/users/auth'

export const {
  signOut,
  refreshSession,
  isAuthenticated,
  signUpWithEmailPassword,
  completeSignUp,
  signInWithEmailPassword,
  startPasswordRecovery,
  checkPasswordRecovery,
  completePasswordRecovery,
  startSignInWithGoogle,
  completeSignInWithGoogle,
  startSignInWithGithub,
  completeSignInWithGithub,
} = authApi
