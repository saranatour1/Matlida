import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

/** An assistant's recent calls, each opening to its transcript. */
export function CallHistory({
  projectId,
  botId,
}: {
  projectId: Id<'projects'>
  botId?: Id<'bots'>
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
                {new Date(call._creationTime).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
              <span className="text-muted-foreground">
                {call.endedAt
                  ? duration(call.endedAt - call._creationTime)
                  : 'Didn’t end cleanly'}
              </span>
            </span>
            {call.firstLine && (
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {call.firstLine}
              </span>
            )}
          </button>
          {open === call._id && (
            <Transcript
              callId={call._id}
              projectId={projectId}
              botId={botId}
              threadId={call.threadId}
            />
          )}
        </li>
      ))}
    </ul>
  )
}

function Transcript({
  callId,
  projectId,
  botId,
  threadId,
}: {
  callId: Id<'calls'>
  projectId: Id<'projects'>
  botId?: Id<'bots'>
  threadId?: string
}) {
  const lines = useQuery(api.api.calls.transcript, { id: callId })
  if (lines === undefined) return null
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
            </li>
          ))}
        </ol>
      )}
      {threadId && (
        <Link
          to="/p/$projectId"
          params={{ projectId }}
          search={{ thread: threadId, bot: botId, panel: true }}
          className="self-start text-muted-foreground underline hover:text-foreground"
        >
          Open the chat
        </Link>
      )}
    </div>
  )
}

/** "45 s", "3 min". */
function duration(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000))
  return seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`
}
