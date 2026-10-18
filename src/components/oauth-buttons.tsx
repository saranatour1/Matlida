import * as React from 'react'
import { useSignInWithGithub } from '@convex-dev/auth/methods/github/react'
import {
  useOauth,
  useSignInWithGoogle,
  type OauthFlowError,
} from '@convex-dev/auth/methods/google/react'
import { api } from '../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { FieldError } from '~/components/ui/field'

function oauthErrorMessage({ error }: OauthFlowError): string {
  switch (error) {
    case 'ACCESS_DENIED':
      return 'Sign-in was cancelled.'
    case 'EXPIRED':
    case 'INVALID_FLOW':
      return 'That sign-in took too long. Try again.'
    case 'REJECTED':
    case 'OTHER_ERROR':
      return 'Something went wrong. Try again.'
  }
}

/**
 * Google and GitHub sign-in. It's a separate form from the email one, so
 * pressing Enter in an email field never starts OAuth.
 */
export function OAuthButtons() {
  const google = useSignInWithGoogle(api.auth)
  const github = useSignInWithGithub(api.auth)
  const { flowError } = useOauth()
  const [error, signIn, isPending] = React.useActionState(
    async (_previous: string | undefined, data: FormData) => {
      const provider = data.get('provider') === 'github' ? github : google
      const result = await provider.signIn()
      return result.status === 'error'
        ? oauthErrorMessage(result.userError)
        : undefined
    },
    undefined,
  )
  const message =
    error ?? (flowError ? oauthErrorMessage(flowError) : undefined)

  return (
    <form action={signIn} className="grid gap-2">
      <Button
        type="submit"
        name="provider"
        value="google"
        variant="outline"
        disabled={isPending}
      >
        Continue with Google
      </Button>
      <Button
        type="submit"
        name="provider"
        value="github"
        variant="outline"
        disabled={isPending}
      >
        Continue with GitHub
      </Button>
      {message && <FieldError>{message}</FieldError>}
    </form>
  )
}
