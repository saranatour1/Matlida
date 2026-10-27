import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useStartPasswordRecovery } from '@convex-dev/auth/methods/email-password/react'
import type { FormState } from '~/lib/auth'
import { api } from '~/lib/api'
import { AuthPage, NoPasswords } from '~/components/auth-page'
import { FormField } from '~/components/form-field'
import { Button } from '~/components/ui/button'
import { useSignInMethods } from '~/hooks/use-sign-in-methods'
import { FieldError, FieldGroup } from '~/components/ui/field'
import { authErrorMessage, forgotPasswordSchema, invalid } from '~/lib/auth'

export const Route = createFileRoute('/_auth/forgot-password')({
  component: ForgotPassword,
})

const backToSignIn = <Link to="/sign-in">Back to sign in</Link>

function ForgotPassword() {
  const methods = useSignInMethods()
  const { startPasswordRecovery } = useStartPasswordRecovery(api.auth)
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(data))
      if (!parsed.success) return invalid(parsed.error, data)
      const result = await startPasswordRecovery(parsed.data)
      return result.success
        ? { sentTo: result.sentTo }
        : {
            error: authErrorMessage(result.userError),
            email: parsed.data.email,
          }
    },
    {},
  )

  if (!methods) return <AuthPage title="Forgot your password?" />
  if (!methods.includes('email')) return <NoPasswords />

  if (state.sentTo) {
    return (
      <AuthPage
        title="Check your email"
        description={`We sent a reset link to ${state.sentTo}. It works for 10 minutes, in this browser.`}
        footer={backToSignIn}
      />
    )
  }

  return (
    <AuthPage
      title="Forgot your password?"
      description="Enter your email and we'll send you a link to reset it. Google and GitHub accounts don't have a password here."
      footer={backToSignIn}
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
          {state.error && <FieldError>{state.error}</FieldError>}
          <Button type="submit" disabled={isPending}>
            Send reset link
          </Button>
        </FieldGroup>
      </form>
    </AuthPage>
  )
}
