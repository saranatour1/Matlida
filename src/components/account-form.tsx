import * as React from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { errorMessage } from '~/lib/errors'

type FormState = { error?: string; saved?: boolean }

/** Your name and the email you signed in with. */
export function AccountForm() {
  const user = useQuery(api.api.users.current)
  const updateProfile = useMutation(api.api.users.updateProfile)
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      try {
        await updateProfile({ name: String(data.get('name')) })
        return { saved: true }
      } catch (e) {
        return { error: errorMessage(e, 'Could not save. Try again.') }
      }
    },
    {},
  )
  if (!user) return null
  const name = user.name ?? user.email
  return (
    <form
      id="account"
      action={submit}
      className="flex flex-col gap-3 rounded-xl border p-4 text-sm"
    >
      <h2 className="font-medium">Account</h2>
      <div className="flex items-center gap-3">
        <Avatar className="size-10">
          <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />
          <AvatarFallback>{name?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate">{user.email ?? 'No email on file'}</p>
          <p className="text-xs text-muted-foreground">
            Your photo and email come from how you signed in.
          </p>
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        Name
        <Input
          name="name"
          defaultValue={user.name ?? ''}
          required
          maxLength={60}
          placeholder="Your name"
        />
      </label>
      {state.error && <p className="text-destructive">{state.error}</p>}
      <div className="flex items-center justify-end gap-2">
        {state.saved && <span className="text-muted-foreground">Saved.</span>}
        <Button type="submit" variant="outline" disabled={isPending}>
          Save
        </Button>
      </div>
    </form>
  )
}
