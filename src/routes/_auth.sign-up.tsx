import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useSignUpWithEmailPassword } from '@convex-dev/auth/methods/email-password/react'
import { api } from '../../convex/_generated/api'
import { AuthPage } from '~/components/auth-page'
import { FormField } from '~/components/form-field'
import { OAuthButtons } from '~/components/oauth-buttons'
import { Button } from '~/components/ui/button'
import { FieldError, FieldGroup, FieldSeparator } from '~/components/ui/field'
import {
  authErrorMessage,
  invalid,
  signUpSchema,
  type FormState,
} from '~/lib/auth'

export const Route = createFileRoute('/_auth/sign-up')({
  component: SignUp,
})

function SignUp() {
  const { signUp } = useSignUpWithEmailPassword(api.api.auth)
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      const parsed = signUpSchema.safeParse(Object.fromEntries(data))
      if (!parsed.success) return invalid(parsed.error, data)
      const { email, password } = parsed.data
      const result = await signUp({ email, password })
      return result.success
        ? { sentTo: email }
        : { error: authErrorMessage(result.userError), email }
    },
    {},
  )

  if (state.sentTo) {
    return (
      <AuthPage
        title="Check your email"
        description={`We sent a link to ${state.sentTo}. Open it in this browser to finish creating your account.`}
        footer={
          // A full load resets the form.
          <a href="/sign-up">Use a different email</a>
        }
      />
    )
  }

  return (
    <AuthPage
      title="Welcome to Matilda"
      description={
        <>
          Already have an account? <Link to="/sign-in">Sign in</Link>
        </>
      }
    >
      <form action={submit} noValidate>
        <FieldGroup>
          <FormField
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            defaultValue={state.email}
            errors={state.fieldErrors?.email}
            required
          />
          <FormField
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            errors={state.fieldErrors?.password}
            required
          />
          <FormField
            name="confirmPassword"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            errors={state.fieldErrors?.confirmPassword}
            required
          />
          {state.error && <FieldError>{state.error}</FieldError>}
          <Button type="submit" disabled={isPending}>
            Create account
          </Button>
        </FieldGroup>
      </form>
      <FieldSeparator>Or</FieldSeparator>
      <OAuthButtons />
    </AuthPage>
  )
}
