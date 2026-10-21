import { CalendarClockIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'

type TimelineToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-show_timeline' }
>
type Item = Extract<
  TimelineToolPart,
  { state: 'output-available' }
>['output']['items'][number]

/** A day in time blocks, or a trip day by day. */
export function TimelinePart({ part }: { part: TimelineToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={CalendarClockIcon}>
        {failed ? `Couldn’t lay out the schedule.` : 'Laying out the schedule…'}
      </ToolStatus>
    )
  }
  const { title, items, note } = part.output
  const groups = new Map<string, Array<Item>>()
  for (const item of items) {
    groups.set(item.group ?? '', [
      ...(groups.get(item.group ?? '') ?? []),
      item,
    ])
  }
  return (
    <div className="mx-1.5 flex max-w-xl flex-col gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground">
      <div className="flex items-center gap-2">
        <CalendarClockIcon className="size-4 text-muted-foreground" />
        <p className="font-medium">{title}</p>
      </div>
      {[...groups].map(([group, entries]) => (
        <div key={group} className="flex flex-col gap-2">
          {group && (
            <p className="text-xs font-medium text-muted-foreground">{group}</p>
          )}
          <ol className="flex flex-col border-l pl-4">
            {entries.map((item, i) => (
              <li key={i} className="relative pb-3 last:pb-0">
                <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" />
                <p className="text-xs text-muted-foreground tabular-nums">
                  {item.when}
                </p>
                <p className="font-medium">{item.title}</p>
                {item.detail && (
                  <p className="text-muted-foreground">{item.detail}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}
