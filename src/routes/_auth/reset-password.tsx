import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useCompletePasswordRecovery } from '@convex-dev/auth/methods/email-password/react'
import type { FormState } from '~/lib/auth'
import { api } from '~/lib/api'
import { AuthPage, NoPasswords } from '~/components/auth-page'
import { FormField } from '~/components/form-field'
import { Button } from '~/components/ui/button'
import { useSignInMethods } from '~/hooks/use-sign-in-methods'
import { FieldError, FieldGroup } from '~/components/ui/field'
import {
  authErrorMessage,
  emailLinkSearch,
  invalid,
  resetPasswordSchema,
} from '~/lib/auth'

/** Where the reset email's link lands. */
export const Route = createFileRoute('/_auth/reset-password')({
  validateSearch: emailLinkSearch,
  component: ResetPassword,
})

/** The form only mounts with email sign-in on: it checks the link as it opens, with a function that's off otherwise. */
function ResetPassword() {
  const methods = useSignInMethods()
  if (!methods) return <AuthPage title="Reset your password" />
  if (!methods.includes('email')) return <NoPasswords />
  return <ResetPasswordForm />
}

function ResetPasswordForm() {
  const { code } = Route.useSearch()
  const recovery = useCompletePasswordRecovery(api.auth, {
    emailCode: code,
  })
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      if (recovery.status !== 'ready') return {}
      const parsed = resetPasswordSchema.safeParse(Object.fromEntries(data))
      if (!parsed.success) return invalid(parsed.error, data)
      const result = await recovery.completePasswordRecovery({
        newPassword: parsed.data.password,
      })
      return result.status === 'complete'
        ? {}
        : { error: authErrorMessage(result.userError) }
    },
    {},
  )

  switch (recovery.status) {
    case 'loading':
      return (
        <AuthPage
          title="Reset your password"
          description="Checking your link…"
        />
      )
    case 'complete':
      return <AuthPage title="Password changed" description="Signing you in…" />
    case 'error':
      return (
        <AuthPage
          title="This link can't be used"
          description={authErrorMessage(recovery.userError)}
          footer={<Link to="/forgot-password">Send a new link</Link>}
        />
      )
  }

  return (
    <AuthPage title="Reset your password" description="Choose a new password.">
      <form action={submit} noValidate>
        <FieldGroup>
          <FormField
            name="password"
            label="New password"
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
            Reset password and sign in
          </Button>
        </FieldGroup>
      </form>
    </AuthPage>
  )
}
