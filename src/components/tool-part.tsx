import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import {
  AlarmClockIcon,
  GlobeIcon,
  ListChecksIcon,
  SendIcon,
  TelescopeIcon,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { ChatUIMessage } from '~/components/chat-message'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
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

// Keyed by the table's `via`, so a new way to remind fails the typecheck until it has words here.
const VIA: Record<Doc<'reminders'>['via'], string> = {
  chat: 'here',
  text: 'by text',
  email: 'by email',
  call: 'with a call',
}

/** A reminder an assistant set, with when and how it will arrive. */
export function ReminderPart({
  part,
}: {
  part: Extract<ChatUIMessage['parts'][number], { type: 'tool-set_reminder' }>
}) {
  const busy =
    part.state === 'input-streaming' || part.state === 'input-available'
  if (part.state === 'output-available' && part.output.to) {
    return (
      <ContactReminder
        reminderId={part.output.reminderId as Id<'reminders'>}
        to={part.output.to}
        at={part.output.at}
      />
    )
  }
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

/** A message to one of your contacts: it waits for Send or Cancel, then says what happened. */
function ContactReminder({
  reminderId,
  to,
  at,
}: {
  reminderId: Id<'reminders'>
  to: string
  at: string
}) {
  const state = useQuery(api.api.reminders.state, { id: reminderId })
  const confirm = useMutation(api.api.reminders.confirm)
  const cancel = useMutation(api.api.reminders.cancel)
  const when = new Date(at).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  return (
    <div className="flex flex-wrap items-center gap-2 px-1.5 text-sm text-muted-foreground">
      <SendIcon className="size-4" />
      {state === 'pending' ? (
        <>
          <span>
            Email {to} on {when}?
          </span>
          <Button size="sm" onClick={() => void confirm({ id: reminderId })}>
            Send
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void cancel({ id: reminderId })}
          >
            Cancel
          </Button>
        </>
      ) : state === 'scheduled' ? (
        `Emailing ${to} on ${when}.`
      ) : state === 'sent' ? (
        `Emailed ${to}.`
      ) : state === 'cancelled' ? (
        `Cancelled the email to ${to}.`
      ) : (
        <Spinner />
      )}
    </div>
  )
}
