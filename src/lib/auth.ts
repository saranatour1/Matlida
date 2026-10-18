import { DEFAULT_MIN_PASSWORD_LENGTH } from '@convex-dev/auth/methods/email-password'
import { z } from 'zod'
import type {
  CompletePasswordRecoveryResult,
  CompletePasswordRecoveryState,
  CompleteSignUpState,
  SignInResult,
  SignUpResult,
  StartPasswordRecoveryResult,
} from '@convex-dev/auth/methods/email-password/react'

const email = z.email('Enter a valid email address.')
const newPassword = z
  .string()
  .min(
    DEFAULT_MIN_PASSWORD_LENGTH,
    `Use at least ${DEFAULT_MIN_PASSWORD_LENGTH} characters.`,
  )
const confirmation = {
  check: (fields: { password: string; confirmPassword: string }) =>
    fields.password === fields.confirmPassword,
  error: { message: "The passwords don't match.", path: ['confirmPassword'] },
}

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
})

export const signUpSchema = z
  .object({ email, password: newPassword, confirmPassword: z.string() })
  .refine(confirmation.check, confirmation.error)

export const forgotPasswordSchema = z.object({ email })

export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine(confirmation.check, confirmation.error)

/** The `?code=` that email links carry. */
export const emailLinkSearch = z.object({ code: z.string().catch('') })

/**
 * What an auth form shows after a submit. Only the email is kept for the
 * inputs, never a password.
 */
export type FormState = {
  error?: string
  fieldErrors?: Partial<Record<string, Array<string>>>
  email?: string
  /** Where a link was emailed. */
  sentTo?: string
}

/** The state for a submit that failed the schema. */
export function invalid(error: z.ZodError, data: FormData): FormState {
  return {
    fieldErrors: z.flattenError(error).fieldErrors,
    email: data.get('email')?.toString(),
  }
}

type ErrorOf<T> = T extends { userError: infer E } ? E : never

type AuthError = ErrorOf<
  | SignInResult
  | SignUpResult
  | StartPasswordRecoveryResult
  | CompletePasswordRecoveryResult
  | CompleteSignUpState
  | CompletePasswordRecoveryState
>

/** A sentence for each way the email and password flows can fail. */
export function authErrorMessage(userError: AuthError): string {
  switch (userError.error) {
    case 'USER_NOT_FOUND':
    case 'EMAIL_NOT_FOUND':
      return 'No account has a password for that email. If you signed up with Google or GitHub, sign in with it instead.'
    case 'INVALID_CREDENTIALS':
      return 'Wrong email or password.'
    case 'INVALID_EMAIL':
      return 'Enter a valid email address.'
    case 'EMAIL_TAKEN':
      return 'That email already has an account. Sign in instead.'
    case 'PASSWORD_TOO_SHORT':
      return `Use at least ${userError.minimumLength} characters.`
    case 'PASSWORD_TOO_LONG':
      return `Use at most ${userError.maximumLength} characters.`
    case 'PASSWORD_HAS_SURROUNDING_WHITESPACE':
      return "Passwords can't start or end with a space."
    case 'PASSWORD_TOO_COMMON':
      return 'That password is too common. Pick another one.'
    case 'RATE_LIMITED':
      return `Too many tries. Try again in ${Math.ceil(userError.retryAfterMs / 1000)} seconds.`
    case 'MISSING_SECRET':
      return 'Open the link in the browser where you asked for it.'
    case 'INVALID_CHALLENGE':
    case 'INCORRECT_CODE':
      return 'This link has expired or was already used.'
    case 'OTHER_ERROR':
      return 'Something went wrong. Try again.'
  }
}
