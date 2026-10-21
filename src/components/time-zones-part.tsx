import { GlobeIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'

type TimesToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-compare_times' }
>

const DAY = ['the day before', '', 'the next day']

/**
 * A time in each place, then the next 24 hours as a strip per place: filled
 * where it's working hours there, ringed where everyone overlaps.
 */
export function TimeZonesPart({ part }: { part: TimesToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={GlobeIcon}>
        {failed
          ? `Couldn’t line up the times: ${part.errorText}`
          : 'Lining up the times…'}
      </ToolStatus>
    )
  }
  const { rows, workStart, workEnd, overlap } = part.output
  const working = (hour: number) => hour >= workStart && hour < workEnd
  const everyone = rows[0].hours.map((_, i) =>
    rows.every((r) => working(r.hours[i])),
  )
  const yours = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  return (
    <section
      aria-label="Times across time zones"
      className="mx-1.5 flex max-w-xl flex-col gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground"
    >
      <div className="flex items-center gap-2">
        <GlobeIcon className="size-4 text-muted-foreground" />
        <p className="font-medium">Across time zones</p>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.label} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="w-28 truncate font-medium">{row.label}</span>
              <span className="tabular-nums">{row.local}</span>
              {row.dayShift !== 0 && (
                <span className="text-xs text-muted-foreground">
                  {DAY[row.dayShift + 1]}
                </span>
              )}
            </div>
            <div className="flex gap-px" aria-hidden>
              {row.hours.map((hour, i) => (
                <span
                  key={i}
                  title={`${hour}:00`}
                  className={`h-3 flex-1 first:rounded-l last:rounded-r ${
                    working(hour) ? 'bg-primary/60' : 'bg-muted'
                  } ${everyone[i] ? 'ring-2 ring-primary ring-inset' : ''}`}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {overlap.length
          ? `Everyone’s between ${workStart}:00 and ${workEnd}:00: ${overlap
              .map((w) => `${yours(w.start)} to ${yours(w.end)}`)
              .join(', ')} your time.`
          : `No hour in the next day has everyone between ${workStart}:00 and ${workEnd}:00.`}
      </p>
    </section>
  )
}
