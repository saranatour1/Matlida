import type { ChatUIMessage } from '~/components/chat-message'
import { Button } from '~/components/ui/button'
import { commandOf, trackEvent } from '~/lib/analytics'

/** The commands the assistant can run, as pills that send `/name`. */
export function CommandsPart({
  part,
  onSend,
}: {
  part: Extract<ChatUIMessage['parts'][number], { type: 'tool-show_commands' }>
  onSend?: (prompt: string) => void
}) {
  if (part.state !== 'output-available') return null
  return (
    <div className="flex flex-wrap gap-2 px-1.5">
      {part.output.commands.map((c) => (
        <Button
          key={c.name}
          variant="outline"
          size="sm"
          className="rounded-full"
          title={c.description}
          disabled={!onSend}
          onClick={() => {
            trackEvent('command_pill_clicked', {
              command: commandOf(`/${c.name}`),
            })
            onSend?.(`/${c.name}`)
          }}
        >
          /{c.name}
        </Button>
      ))}
    </div>
  )
}
