import { useMutation } from 'convex/react'
import { CpuIcon } from 'lucide-react'
import {
  CHAT_MODELS,
  MODELS,
  isListedModel,
  modelName,
} from '@convex/lib/models'
import type { Id } from '@convex/_generated/dataModel'
import { api } from '~/lib/api'
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
import { attempt } from '~/lib/attempt'
import { trackEvent } from '~/lib/analytics'

/**
 * Picks the model the chat's assistant replies with, saved on the assistant
 * at once; the history stays. "Default" goes back to the app's default.
 */
export function ModelMenu({
  projectId,
  botId,
  model,
}: {
  projectId: Id<'projects'>
  /** The bot, or unset for the lead. */
  botId?: Id<'bots'>
  /** The assistant's own pick, when it has one. */
  model?: string
}) {
  const setModel = useMutation(api.threads.setModel)
  const current = model ?? MODELS.chat
  const pick = (next: string | undefined) => {
    trackEvent('model_changed', {
      model: next ?? 'default',
      assistant: botId ? 'bot' : 'lead',
    })
    void attempt(setModel({ projectId, botId, model: next ?? null }))
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
        aria-label="Model"
        title="Model"
      >
        <CpuIcon className="text-muted-foreground" />
        <span className="max-w-32 truncate text-xs">{modelName(current)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Model for this chat
            <span className="block text-xs font-normal text-muted-foreground">
              Switching keeps the chat's history.
            </span>
          </DropdownMenuLabel>
          {Object.entries(CHAT_MODELS).map(([id, m]) => (
            <DropdownMenuItem
              key={id}
              onClick={() => pick(id)}
              data-checked={id === current}
            >
              <span className="flex flex-col">
                {m.name}
                <span className="text-xs text-muted-foreground">
                  {m.maker} · {m.note}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
          {!isListedModel(current) && (
            <DropdownMenuItem data-checked>{current}</DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => pick(undefined)}>
          <span className="flex flex-col">
            Default
            <span className="text-xs text-muted-foreground">
              {modelName(undefined)}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
