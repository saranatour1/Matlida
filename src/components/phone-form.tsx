import * as React from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { errorMessage } from '~/lib/errors'

type FormState = { error?: string; saved?: boolean }

/** Where assistants call you for reminders, and whether calls are set up. */
export function PhoneForm() {
  const status = useQuery(api.api.reminders.callStatus)
  const setPhone = useMutation(api.api.users.setPhone)
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      try {
        await setPhone({ phone: String(data.get('phone')) })
        return { saved: true }
      } catch (e) {
        return { error: errorMessage(e, 'Could not save. Try again.') }
      }
    },
    {},
  )
  if (!status) return null
  return (
    <form
      action={submit}
      className="flex flex-col gap-3 rounded-xl border p-4 text-sm"
    >
      <h2 className="font-medium">Calls</h2>
      <p className="text-muted-foreground">
        {status.configured
          ? 'Assistants can call you with reminders, through Photon.'
          : "Reminder calls aren't set up on this deployment yet, so they arrive as texts."}
      </p>
      <label className="flex flex-col gap-1.5">
        Your phone number
        <Input
          name="phone"
          type="tel"
          defaultValue={status.phone ?? ''}
          placeholder="+14155550123"
        />
      </label>
      {state.error && <p className="text-destructive">{state.error}</p>}
      <div className="flex items-center justify-end gap-2">
        {state.saved && <span className="text-muted-foreground">Saved.</span>}
        <Button type="submit" variant="outline" disabled={isPending}>
          Save number
        </Button>
      </div>
    </form>
  )
}
