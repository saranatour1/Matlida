import * as React from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '~/components/ui/button'

/** Copies `text` (or what it returns, read on click) and says Copied for a moment. `compact` shows only the icon. */
export function CopyButton({
  text,
  label = 'Copy',
  compact = false,
  className,
}: {
  text: string | (() => string)
  label?: string
  compact?: boolean
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)
  const copy = () =>
    void navigator.clipboard
      .writeText(typeof text === 'string' ? text : text())
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={cn(compact ? 'size-7 p-0' : 'h-7 px-2', className)}
      onClick={copy}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {!compact && (copied ? 'Copied' : label)}
      <span role="status" className="sr-only">
        {copied ? 'Copied' : ''}
      </span>
    </Button>
  )
}
