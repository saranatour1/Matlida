import { Link, useParams } from '@tanstack/react-router'
import type { AskBotPart } from '~/components/chat-message'
import { Markdown } from '~/components/chat-message'
import { Spinner } from '~/components/ui/spinner'

/** The lead handing work to a bot: its task, its reply, and a link to the sub-thread. */
export function BotPart({ part }: { part: AskBotPart }) {
  const { projectId } = useParams({ strict: false })
  const bot = part.input?.bot ?? 'a bot'
  // Some saved replies come back without their input, whatever the types say.
  const task = part.input?.task

  switch (part.state) {
    case 'input-streaming':
    case 'input-available':
      return (
        <div className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
          <Spinner />
          Asking {bot}…
        </div>
      )
    case 'output-available':
      return (
        <details className="rounded-lg border px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            <span className="font-medium text-foreground">
              {part.output.name}
            </span>{' '}
            · {part.output.role}
          </summary>
          {task && (
            <p className="mt-2 text-muted-foreground">
              <span className="font-medium text-foreground">Task:</span> {task}
            </p>
          )}
          <div className="mt-2">
            <Markdown text={part.output.reply} />
          </div>
          {projectId && (
            <Link
              to="/p/$projectId"
              params={{ projectId }}
              search={{ bot: part.output.botId }}
              className="mt-2 inline-block text-xs text-muted-foreground underline hover:text-foreground"
            >
              Open {part.output.name}'s chat
            </Link>
          )}
        </details>
      )
    case 'output-error':
      return (
        <div className="px-1.5 text-sm text-destructive">
          {bot} couldn't finish: {part.errorText}
        </div>
      )
    default:
      return null
  }
}
