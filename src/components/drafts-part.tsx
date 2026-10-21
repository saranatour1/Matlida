import { PenLineIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'
import { CopyButton } from '~/components/copy-button'

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
    <section aria-label={title} className="mx-1.5 flex max-w-xl flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {title}
        {to && ` · to ${to}`}
      </p>
      {drafts.map((draft, i) => (
        <Draft key={i} label={draft.label} text={draft.text} />
      ))}
    </section>
  )
}

function Draft({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-sm text-card-foreground">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {text.length.toLocaleString()} characters
        </span>
        <CopyButton text={text} className="ml-auto" />
      </div>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  )
}
