import * as React from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { errorMessage } from '~/lib/errors'

type FormState = { error?: string; saved?: boolean }

const FIELDS = [
  ['firstName', 'First name', true],
  ['lastName', 'Last name', true],
  ['email', 'Email for orders', true],
  ['address1', 'Address', true],
  ['address2', 'Apartment, suite', false],
  ['city', 'City', true],
  ['province', 'State or region', false],
  ['zip', 'Postal code', true],
  ['country', 'Country code, like US', true],
] as const

/**
 * Where your orders go. Filled into a store's checkout when you press Buy;
 * no card details, since you pay on the store's checkout.
 */
export function ShoppingDetailsForm() {
  const details = useQuery(api.api.shopping.details)
  const user = useQuery(api.api.users.current)
  const save = useMutation(api.api.shopping.saveDetails)
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      const field = (name: string) => String(data.get(name) ?? '')
      try {
        await save({
          firstName: field('firstName'),
          lastName: field('lastName'),
          email: field('email'),
          address1: field('address1'),
          address2: field('address2'),
          city: field('city'),
          province: field('province'),
          zip: field('zip'),
          country: field('country'),
          notes: field('notes'),
        })
        return { saved: true }
      } catch (e) {
        return { error: errorMessage(e, 'Could not save. Try again.') }
      }
    },
    {},
  )
  if (details === undefined || user === undefined) return null
  return (
    <form
      id="shopping"
      key={details?._id ?? 'new'}
      action={submit}
      className="flex flex-col gap-3 rounded-xl border p-4 text-sm"
    >
      <div>
        <h2 className="font-medium">Shopping details</h2>
        <p className="text-muted-foreground">
          When you press Buy, the store’s checkout opens with these filled in,
          and you pay there. No card details are stored here.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([name, label, required]) => (
          <label key={name} className="flex flex-col gap-1.5">
            {label}
            <Input
              name={name}
              required={required}
              defaultValue={
                details?.[name] ?? (name === 'email' ? (user?.email ?? '') : '')
              }
              maxLength={name === 'country' ? 2 : 120}
              autoComplete={AUTOCOMPLETE[name]}
            />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        Sizes and preferences
        <Textarea
          name="notes"
          rows={3}
          maxLength={1000}
          defaultValue={details?.notes ?? ''}
          placeholder="Shoe size 38 EU, shirts M, no wool, prefer black."
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

const AUTOCOMPLETE: Record<(typeof FIELDS)[number][0], string> = {
  firstName: 'given-name',
  lastName: 'family-name',
  email: 'email',
  address1: 'address-line1',
  address2: 'address-line2',
  city: 'address-level2',
  province: 'address-level1',
  zip: 'postal-code',
  country: 'country',
}
