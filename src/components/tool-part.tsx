import { useMutation, useQuery } from 'convex/react'
import {
  AlarmClockIcon,
  GlobeIcon,
  ScaleIcon,
  SendIcon,
  TelescopeIcon,
} from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { ComponentType, ReactNode } from 'react'
import type { ChatUIMessage } from '~/components/chat-message'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { reminderWhen } from '~/lib/reminders'
import { Markdown } from '~/components/chat-message'
import { Spinner } from '~/components/ui/spinner'

type Part = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-web_search' | 'tool-research' }
>

/** A card's line while its tool runs, or when it failed: a spinner, or `icon` and the error. */
export function ToolStatus({
  failed,
  icon: Icon,
  children,
}: {
  failed: boolean
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground"
    >
      {failed ? <Icon className="size-4" /> : <Spinner />}
      {children}
    </div>
  )
}

/** Search and research tool calls, as a status line that opens to the result. */
export function ToolPart({ part }: { part: Part }) {
  const busy =
    part.state === 'input-streaming' || part.state === 'input-available'
  const failed = part.state === 'output-error'

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

/** A decision Jev made, with each option's odds, the pick first. */
export function DecidePart({
  part,
}: {
  part: Extract<ChatUIMessage['parts'][number], { type: 'tool-decide' }>
}) {
  // Some saved results come back without their input, whatever the types say.
  const question = part.input?.question
  if (part.state !== 'output-available') {
    return (
      <div className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
        {part.state === 'output-error' ? (
          <ScaleIcon className="size-4" />
        ) : (
          <Spinner />
        )}
        {part.state === 'output-error'
          ? `Couldn't decide “${question ?? ''}”.`
          : `Deciding “${question ?? '…'}”…`}
      </div>
    )
  }
  const { choice, probabilities } = part.output
  const odds = Object.entries(probabilities).sort(([, a], [, b]) => b - a)
  return (
    <section
      aria-label={`Decision: ${question ?? ''}`}
      className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <ScaleIcon className="size-4" />
        <span className="truncate">{question}</span>
        <span className="ml-auto shrink-0 text-xs">
          {Math.round((probabilities[choice] ?? 0) * 100)}% for {choice}
        </span>
      </div>
      {odds.map(([name, p]) => (
        <div key={name} className="flex items-center gap-2">
          <span
            className={`w-32 truncate ${name === choice ? 'font-medium' : 'text-muted-foreground'}`}
          >
            {name}
          </span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.round(p * 100)}%` }}
            />
          </span>
          <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
            {Math.round(p * 100)}%
          </span>
        </div>
      ))}
    </section>
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
        ? `Reminder set for ${reminderWhen(part.output.at, part.output.every)}, ${VIA[part.output.via]}.`
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
  const when = reminderWhen(at)
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
