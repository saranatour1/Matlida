import { Link, useParams } from '@tanstack/react-router'
import { SunIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import type { ReactNode } from 'react'
import { ToolStatus } from '~/components/tool-part'

type TodayToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-get_today' }
>

const time = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

/** The day at a glance: what needs you, what's coming up, and what's left on your lists. */
export function TodayPart({ part }: { part: TodayToolPart }) {
  const { projectId } = useParams({ strict: false })
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={SunIcon}>
        {failed ? `Couldn’t look at today.` : 'Looking at your day…'}
      </ToolStatus>
    )
  }
  const { now, reminders, toConfirm, tasks, emails, lists } = part.output
  const waiting = tasks.filter((t) => t.status === 'waiting_for_you')
  const running = tasks.filter((t) => t.status === 'running')
  const needsYou = toConfirm + waiting.length + emails.length
  const empty =
    needsYou + reminders.length + running.length + lists.length === 0
  return (
    <section
      aria-label="Your day"
      className="mx-1.5 flex max-w-md flex-col gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground"
    >
      <div className="flex items-center gap-2">
        <SunIcon className="size-4 text-muted-foreground" />
        <p className="font-medium">
          {new Date(now).toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>
      {empty && (
        <p className="text-muted-foreground">Nothing due. A clear day.</p>
      )}
      {needsYou > 0 && (
        <Section title="Needs you">
          {toConfirm > 0 && (
            <li>
              {toConfirm === 1
                ? 'A message waits for your OK'
                : `${toConfirm} messages wait for your OK`}
            </li>
          )}
          {waiting.map((t, i) => (
            <li key={`t${i}`}>Press Start on “{t.title}”</li>
          ))}
          {emails.map((e, i) => (
            <li key={`e${i}`}>
              Reply to {e.from}
              <span className="text-muted-foreground">
                {' '}
                · {e.subject || '(no subject)'}
              </span>
            </li>
          ))}
        </Section>
      )}
      {reminders.length > 0 && (
        <Section title="Coming up">
          {reminders.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-16 shrink-0 text-muted-foreground tabular-nums">
                {time(r.dueAt)}
              </span>
              <span>
                {r.to ? `Message ${r.to}: ` : ''}
                {r.message}
              </span>
            </li>
          ))}
        </Section>
      )}
      {running.length > 0 && (
        <Section title="Working on">
          {running.map((t, i) => (
            <li key={i}>{t.title}</li>
          ))}
        </Section>
      )}
      {lists.length > 0 && (
        <Section title="Lists">
          {lists.map((l) => (
            <li key={l.planId}>
              {l.title}{' '}
              <span className="text-muted-foreground">
                · {l.left} left: {l.next.join(', ')}
                {l.left > l.next.length && '…'}
              </span>
            </li>
          ))}
          {projectId && (
            <Link
              to="/p/$projectId/library"
              params={{ projectId }}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Open the Library
            </Link>
          )}
        </Section>
      )}
    </section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  )
}
