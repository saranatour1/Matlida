import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { DateTime } from 'luxon'
import { api } from '@convex/_generated/api'
import { maskNumber } from '@convex/lib/phone'
import { formatTranscript } from '@convex/lib/transcript'
import type { Doc, Id } from '@convex/_generated/dataModel'

/** An assistant's recent calls, each opening to its transcript. */
export function CallHistory({
  projectId,
  botId,
  name,
}: {
  projectId: Id<'projects'>
  botId?: Id<'bots'>
  /** The assistant's name, for the copied transcript. */
  name: string
}) {
  const calls = useQuery(api.api.calls.history, { projectId, botId })
  const [open, setOpen] = React.useState<Id<'calls'>>()
  if (calls === undefined) return null
  if (calls.length === 0) {
    return (
      <p className="text-muted-foreground">
        No calls yet. Start one with the phone button.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-1">
      {calls.map((call) => (
        <li key={call._id}>
          <button
            type="button"
            aria-expanded={open === call._id}
            onClick={() => setOpen(open === call._id ? undefined : call._id)}
            className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted"
          >
            <span className="flex justify-between gap-2 text-xs">
              <span>
                {DateTime.fromMillis(call._creationTime).toLocaleString(
                  DateTime.DATETIME_MED,
                )}
              </span>
              <span className="text-muted-foreground">
                {duration(call.endedAt - call._creationTime)}
              </span>
            </span>
            {call.phone && (
              <span className="text-xs">
                Called {maskNumber(call.phone.to)} for you
                {call.phone.about && (
                  <span className="text-muted-foreground">
                    {' '}
                    · {call.phone.about}
                  </span>
                )}
              </span>
            )}
            {call.firstLine && (
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {call.firstLine}
              </span>
            )}
          </button>
          {open === call._id && (
            <Transcript call={call} botId={botId} name={name} />
          )}
        </li>
      ))}
    </ul>
  )
}

function Transcript({
  call,
  botId,
  name,
}: {
  call: Doc<'calls'>
  botId?: Id<'bots'>
  name: string
}) {
  const lines = useQuery(api.api.calls.transcript, { id: call._id })
  const [copied, setCopied] = React.useState(false)
  if (lines === undefined) return null
  async function copy(said: Array<Doc<'callLines'>>) {
    const text = formatTranscript({
      name,
      when: DateTime.fromMillis(call._creationTime).toLocaleString(
        DateTime.DATETIME_MED,
      ),
      call,
      lines: said,
    })
    await navigator.clipboard.writeText(text)
    setCopied(true)
  }
  return (
    <div className="flex flex-col gap-2 px-2 pt-1 pb-3 text-xs">
      {lines.length === 0 ? (
        <p className="text-muted-foreground">Nothing was said.</p>
      ) : (
        <ol aria-label="Transcript" className="flex flex-col gap-2">
          {lines.map((line) => (
            <li
              key={line._id}
              className={
                line.who === 'you'
                  ? 'max-w-[85%] self-end rounded-xl bg-muted px-2.5 py-1.5'
                  : 'max-w-[85%]'
              }
            >
              {line.text}
              {line.cutOff && (
                <span className="text-muted-foreground"> (cut off)</span>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-3 text-muted-foreground">
        {lines.length > 0 && (
          <button
            type="button"
            onClick={() => void copy(lines)}
            className="underline hover:text-foreground"
          >
            {copied ? 'Copied' : 'Copy transcript'}
          </button>
        )}
        {call.threadId && (
          <Link
            to="/p/$projectId"
            params={{ projectId: call.projectId }}
            search={{ bot: botId, panel: true }}
            className="underline hover:text-foreground"
          >
            Open the chat
          </Link>
        )}
      </div>
    </div>
  )
}

/** "45 s", "3 min". */
function duration(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000))
  return seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`
}
