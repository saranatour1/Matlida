import type * as React from 'react'
import { Field, FieldError, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'

/** A labelled input with its validation messages. */
export function FormField({
  label,
  errors,
  ...input
}: React.ComponentProps<typeof Input> & {
  name: string
  label: string
  errors?: string[]
}) {
  const invalid = errors?.length ? true : undefined
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={input.name}>{label}</FieldLabel>
      <Input id={input.name} aria-invalid={invalid} {...input} />
      <FieldError errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}
