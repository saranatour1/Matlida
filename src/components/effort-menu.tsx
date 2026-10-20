import { useMutation } from 'convex/react'
import { GaugeIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { EFFORTS } from '../../convex/lib/models'
import type { Effort } from '../../convex/lib/models'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { InputGroupButton } from '~/components/ui/input-group'

/**
 * Picks how hard a chat's replies work: steps, bots asked and the model's
 * reasoning effort. Saved on an open chat at once; on a new chat it's kept
 * until the first message. "Assistant's own" goes back to the bot's or lead's.
 */
export function EffortMenu({
  threadId,
  effort,
  own,
  onPick,
}: {
  threadId?: string
  /** The chat's own pick, when it has one. */
  effort?: Effort
  /** The assistant's own effort, used when the chat has no pick. */
  own?: Effort
  /** For a new chat: remembers the pick for the first message. */
  onPick: (effort: Effort | undefined) => void
}) {
  const setEffort = useMutation(api.api.threads.setEffort)
  const current = effort ?? own ?? 'medium'
  const pick = (next: Effort | undefined) => {
    onPick(next)
    if (threadId) void setEffort({ threadId, effort: next ?? null })
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <InputGroupButton
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2.5"
          />
        }
        aria-label="Effort"
        title="Effort"
      >
        <GaugeIcon className="text-muted-foreground" />
        <span className="text-xs">{EFFORTS[current].name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Effort for this chat</DropdownMenuLabel>
          {(Object.keys(EFFORTS) as Array<Effort>).map((e) => (
            <DropdownMenuItem
              key={e}
              onClick={() => pick(e)}
              data-checked={e === current}
            >
              <span className="flex flex-col">
                {EFFORTS[e].name}
                <span className="text-xs text-muted-foreground">
                  {EFFORTS[e].note}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => pick(undefined)}>
          <span className="flex flex-col">
            Assistant&rsquo;s own
            <span className="text-xs text-muted-foreground">
              {EFFORTS[own ?? 'medium'].name}, as set in its form
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
