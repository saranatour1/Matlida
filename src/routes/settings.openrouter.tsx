import * as React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAction } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { errorMessage } from '~/lib/errors'
import { takeOpenRouterVerifier } from '~/lib/openrouter'
import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/settings/openrouter')({
  validateSearch: (search: Record<string, unknown>): { code?: string } => ({
    code: typeof search.code === 'string' ? search.code : undefined,
  }),
  component: OpenRouterCallback,
})

/** Where OpenRouter sends the browser back after sign-in. */
function OpenRouterCallback() {
  const { code } = Route.useSearch()
  const connect = useAction(api.aiConnections.connectOpenRouter)
  const navigate = useNavigate()
  const [error, finish, isPending] = React.useActionState(async () => {
    const codeVerifier = takeOpenRouterVerifier()
    if (!code || !codeVerifier) {
      return 'This sign-in expired. Start again from Settings.'
    }
    try {
      await connect({ code, codeVerifier })
      void navigate({ to: '/settings' })
      return undefined
    } catch (e) {
      return errorMessage(e, "OpenRouter didn't finish connecting. Try again.")
    }
  }, undefined)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-6">
      <h1 className="text-lg font-semibold">Connect OpenRouter</h1>
      <p className="text-sm text-muted-foreground">
        OpenRouter sent you back. Finish connecting to save the key to your
        account.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <form action={finish}>
        <Button type="submit" disabled={isPending}>
          Finish connecting
        </Button>
      </form>
    </div>
  )
}
