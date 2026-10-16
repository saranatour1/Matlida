import * as React from 'react'
import {
  useSignInWithPassword,
  useSignUpWithPassword,
  type SignInWithPasswordResult,
  type SignUpWithPasswordResult,
} from '@convex-dev/auth/providers/password/react'
import { api } from '../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'

type Failure = Exclude<
  SignInWithPasswordResult | SignUpWithPasswordResult,
  { status: 'complete' }
>

function failureMessage({ userError }: Failure): string {
  switch (userError.error) {
    case 'USER_NOT_FOUND':
      return 'No account with that username. Create one instead?'
    case 'INVALID_CREDENTIALS':
      return 'Wrong username or password.'
    case 'USERNAME_TAKEN':
      return 'That username is taken.'
    case 'USERNAME_TOO_SHORT':
      return `Usernames need at least ${userError.minimumLength} characters.`
    case 'USERNAME_HAS_SURROUNDING_WHITESPACE':
      return "Usernames can't start or end with a space."
    case 'USERNAME_HAS_INVALID_CHARACTERS':
      return "That username has characters that aren't allowed."
    case 'PASSWORD_TOO_SHORT':
      return `Passwords need at least ${userError.minimumLength} characters.`
    case 'PASSWORD_TOO_LONG':
      return `Passwords can be at most ${userError.maximumLength} characters.`
    case 'PASSWORD_HAS_SURROUNDING_WHITESPACE':
      return "Passwords can't start or end with a space."
    case 'PASSWORD_TOO_COMMON':
      return 'That password is too common. Pick another one.'
    case 'RATE_LIMITED':
      return `Too many tries. Wait ${Math.ceil(userError.retryAfterMs / 1000)} seconds.`
    case 'OTHER_ERROR':
      return 'Something went wrong. Try again.'
  }
}

/** Sign in, or create an account with the same two fields. */
export function AuthScreen() {
  const { signIn } = useSignInWithPassword(api.auth.signInWithPassword)
  const { signUp } = useSignUpWithPassword(api.auth.signUpWithPassword)
  const [state, submit, isPending] = React.useActionState(
    async (
      _previous: { error?: string; username?: string },
      data: FormData,
    ) => {
      const credentials = {
        username: String(data.get('username')),
        password: String(data.get('password')),
      }
      const result =
        data.get('intent') === 'signUp'
          ? await signUp(credentials)
          : await signIn(credentials)
      return result.status === 'complete'
        ? {}
        : { error: failureMessage(result), username: credentials.username }
    },
    {},
  )

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <form action={submit} className="flex w-full max-w-sm flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold">Matilda</h1>
          <p className="text-sm text-muted-foreground">
            Sign in, or create an account to start a project.
          </p>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          Username
          <Input
            name="username"
            defaultValue={state.username}
            autoComplete="username"
            required
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Password
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            type="submit"
            name="intent"
            value="signIn"
            disabled={isPending}
            className="flex-1"
          >
            Sign in
          </Button>
          <Button
            type="submit"
            name="intent"
            value="signUp"
            variant="outline"
            disabled={isPending}
            className="flex-1"
          >
            Create account
          </Button>
        </div>
      </form>
    </main>
  )
}
