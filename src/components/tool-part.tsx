import { Link, useParams } from '@tanstack/react-router'
import {
  AlarmClockIcon,
  GlobeIcon,
  ListChecksIcon,
  TelescopeIcon,
} from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { Markdown } from '~/components/chat-message'
import { Spinner } from '~/components/ui/spinner'

type Part = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-web_search' | 'tool-research' | 'tool-save_plan' }
>

/** Search, research and plan tool calls, as a status line that opens to the result. */
export function ToolPart({ part }: { part: Part }) {
  const { projectId } = useParams({ strict: false })
  const busy =
    part.state === 'input-streaming' || part.state === 'input-available'
  const failed = part.state === 'output-error'

  if (part.type === 'tool-save_plan') {
    return (
      <div className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
        {busy ? <Spinner /> : <ListChecksIcon className="size-4" />}
        {failed
          ? `Couldn't save the plan.`
          : busy
            ? 'Saving the plan…'
            : `Saved “${part.input.title}”.`}
        {part.state === 'output-available' && projectId && (
          <Link
            to="/p/$projectId/library"
            params={{ projectId }}
            className="underline hover:text-foreground"
          >
            Open the Library
          </Link>
        )}
      </div>
    )
  }

  const isResearch = part.type === 'tool-research'
  const Icon = isResearch ? TelescopeIcon : GlobeIcon
  const topic = isResearch ? part.input?.question : part.input?.query
  const label = `${isResearch ? 'Researching' : 'Searching the web for'} “${topic ?? '…'}”`
  if (part.state !== 'output-available') {
    return (
      <div className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
        {busy ? <Spinner /> : <Icon className="size-4" />}
        {failed ? `${label} failed.` : `${label}…`}
      </div>
    )
  }
  const result =
    part.type === 'tool-research' ? part.output.report : part.output.answer
  return (
    <details className="rounded-lg border px-3 py-2 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        {isResearch ? 'Researched' : 'Searched'} “{topic}”
      </summary>
      <div className="mt-2">
        <Markdown text={result} />
      </div>
    </details>
  )
}

const VIA = { chat: 'here', text: 'by text' } as const

/** A reminder an assistant set, with when and how it will arrive. */
export function ReminderPart({
  part,
}: {
  part: Extract<ChatUIMessage['parts'][number], { type: 'tool-set_reminder' }>
}) {
  const busy =
    part.state === 'input-streaming' || part.state === 'input-available'
  return (
    <div className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
      {busy ? <Spinner /> : <AlarmClockIcon className="size-4" />}
      {part.state === 'output-available'
        ? `Reminder set for ${new Date(part.output.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}, ${VIA[part.output.via]}.`
        : part.state === 'output-error'
          ? `Couldn't set the reminder: ${part.errorText}`
          : 'Setting a reminder…'}
    </div>
  )
}
