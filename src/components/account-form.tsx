import * as React from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '~/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { errorMessage } from '~/lib/errors'
import { attempt } from '~/lib/attempt'

type FormState = { error?: string; saved?: boolean }

/** Your name, the email you signed in with, and whether assistants may call to check in. */
export function AccountForm() {
  const user = useQuery(api.users.current)
  const updateProfile = useMutation(api.users.updateProfile)
  const setCheckIns = useMutation(api.users.setCheckIns)
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
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          role="switch"
          checked={user.checkIns !== false}
          onChange={(e) => void attempt(setCheckIns({ on: e.target.checked }))}
          className="mt-1 accent-primary"
        />
        <span>
          Let assistants call to check in
          <span className="block text-xs text-muted-foreground">
            Only between 9am and 9pm, at most 3 times a day, when something you
            talked about may need a follow-up.
          </span>
        </span>
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
