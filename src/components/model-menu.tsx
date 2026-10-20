import { useMutation } from 'convex/react'
import { CpuIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { CHAT_MODELS, MODELS, modelName } from '../../convex/lib/models'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'

/**
 * Picks the model a chat replies with. On an open chat it's saved on the
 * thread at once and the history stays; on a new chat it's kept until the
 * first message starts the thread. "Assistant's own" goes back to what the
 * bot or the lead is set to.
 */
export function ModelMenu({
  threadId,
  model,
  own,
  onPick,
}: {
  threadId?: string
  /** The chat's own pick, when it has one. */
  model?: string
  /** The assistant's own model, used when the chat has no pick. */
  own?: string
  /** For a new chat: remembers the pick for the first message. */
  onPick: (model: string | undefined) => void
}) {
  const setModel = useMutation(api.api.threads.setModel)
  const current = model ?? own ?? MODELS.chat
  const pick = (next: string | undefined) => {
    onPick(next)
    if (threadId) void setModel({ threadId, model: next ?? null })
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="h-7 gap-1" />}
        aria-label="Model"
        title="Model"
      >
        <CpuIcon className="size-3.5 text-muted-foreground" />
        <span className="hidden text-xs @md:inline">{modelName(current)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Model for this chat
            <span className="block text-xs font-normal text-muted-foreground">
              Switching keeps the chat's history.
            </span>
          </DropdownMenuLabel>
          {CHAT_MODELS.map((m) => (
            <DropdownMenuItem
              key={m.id}
              onClick={() => pick(m.id)}
              data-checked={m.id === current}
            >
              <span className="flex flex-col">
                {m.name}
                <span className="text-xs text-muted-foreground">
                  {m.maker} · {m.note}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
          {!CHAT_MODELS.some((m) => m.id === current) && (
            <DropdownMenuItem data-checked>{current}</DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => pick(undefined)}>
          <span className="flex flex-col">
            Assistant&rsquo;s own
            <span className="text-xs text-muted-foreground">
              {modelName(own)}, as set in its form
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
