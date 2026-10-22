import { useMutation } from 'convex/react'
import { GaugeIcon } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { EFFORTS } from '@convex/lib/models'
import type { Id } from '@convex/_generated/dataModel'
import type { Effort } from '@convex/lib/models'
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
  projectId,
  botId,
  effort,
}: {
  projectId: Id<'projects'>
  /** The bot, or unset for the lead. */
  botId?: Id<'bots'>
  /** The assistant's own pick, when it has one. */
  effort?: Effort
}) {
  const setEffort = useMutation(api.api.threads.setEffort)
  const current = effort ?? 'medium'
  const pick = (next: Effort | undefined) => {
    void setEffort({ projectId, botId, effort: next ?? null })
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
            Default
            <span className="text-xs text-muted-foreground">
              {EFFORTS.medium.name}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
