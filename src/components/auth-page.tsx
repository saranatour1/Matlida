import { Link } from '@tanstack/react-router'
import type * as React from 'react'
import { FieldDescription, FieldGroup } from '~/components/ui/field'

/** The layout every auth page shares, from shadcn's signup-05 block. */
export function AuthPage({
  title,
  description,
  footer,
  children,
}: {
  title: string
  description?: React.ReactNode
  footer?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <Link to="/" className="flex flex-col items-center gap-2 font-medium">
            <img src="/logo.svg" alt="" className="size-12" />
            <span className="sr-only">Matilda</span>
          </Link>
          <h1 className="text-xl font-bold">{title}</h1>
          {description && (
            <FieldDescription className="text-center">
              {description}
            </FieldDescription>
          )}
        </div>
        {children}
      </FieldGroup>
      {footer && (
        <FieldDescription className="px-6 text-center">
          {footer}
        </FieldDescription>
      )}
    </div>
  )
}
