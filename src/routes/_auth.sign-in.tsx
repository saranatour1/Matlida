import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useSignInWithEmailPassword } from '@convex-dev/auth/methods/email-password/react'
import { api } from '../../convex/_generated/api'
import { AuthPage } from '~/components/auth-page'
import { FormField } from '~/components/form-field'
import { OAuthButtons } from '~/components/oauth-buttons'
import { Button } from '~/components/ui/button'
import { FieldError, FieldGroup, FieldSeparator } from '~/components/ui/field'
import {
  authErrorMessage,
  invalid,
  signInSchema,
  type FormState,
} from '~/lib/auth'

export const Route = createFileRoute('/_auth/sign-in')({
  component: SignIn,
})

function SignIn() {
  const { signIn } = useSignInWithEmailPassword(api.auth)
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      const parsed = signInSchema.safeParse(Object.fromEntries(data))
      if (!parsed.success) return invalid(parsed.error, data)
      const result = await signIn(parsed.data)
      return result.status === 'complete'
        ? {}
        : {
            error: authErrorMessage(result.userError),
            email: parsed.data.email,
          }
    },
    {},
  )

  return (
    <AuthPage
      title="Welcome back"
      description={
        <>
          Don't have an account? <Link to="/sign-up">Sign up</Link>
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
            autoComplete="current-password"
            errors={state.fieldErrors?.password}
            labelAction={
              <Link
                to="/forgot-password"
                className="underline-offset-4 hover:underline"
              >
                Forgot your password?
              </Link>
            }
            required
          />
          {state.error && <FieldError>{state.error}</FieldError>}
          <Button type="submit" disabled={isPending}>
            Sign in
          </Button>
        </FieldGroup>
      </form>
      <FieldSeparator>Or</FieldSeparator>
      <OAuthButtons />
    </AuthPage>
  )
}
