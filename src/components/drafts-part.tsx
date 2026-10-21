import * as React from 'react'
import { CheckIcon, CopyIcon, PenLineIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'
import { Button } from '~/components/ui/button'

type DraftsToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-show_drafts' }
>

/** Versions of a reply, rewrite or translation, each ready to copy. */
export function DraftsPart({ part }: { part: DraftsToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={PenLineIcon}>
        {failed ? `Couldn’t show the drafts.` : 'Writing…'}
      </ToolStatus>
    )
  }
  const { title, to, drafts } = part.output
  return (
    <div className="mx-1.5 flex max-w-xl flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {title}
        {to && ` · to ${to}`}
      </p>
      {drafts.map((draft, i) => (
        <Draft key={i} label={draft.label} text={draft.text} />
      ))}
    </div>
  )
}

function Draft({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="rounded-xl border bg-card p-3 text-sm text-card-foreground">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {text.length.toLocaleString()} characters
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 px-2"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(() => setCopied(true))
          }
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  )
}
