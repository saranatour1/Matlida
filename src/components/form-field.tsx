import type * as React from 'react'
import { Field, FieldError, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'

/** A labelled input with its validation messages. */
export function FormField({
  label,
  labelAction,
  errors,
  ...input
}: React.ComponentProps<typeof Input> & {
  name: string
  label: string
  /** Shown at the end of the label row, like a "Forgot your password?" link. */
  labelAction?: React.ReactNode
  errors?: string[]
}) {
  const invalid = errors?.length ? true : undefined
  return (
    <Field data-invalid={invalid}>
      <div className="flex items-center">
        <FieldLabel htmlFor={input.name}>{label}</FieldLabel>
        {labelAction && <div className="ml-auto text-sm">{labelAction}</div>}
      </div>
      <Input id={input.name} aria-invalid={invalid} {...input} />
      <FieldError errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}
