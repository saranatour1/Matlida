import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { useProject } from '~/hooks/use-project'
import type { AskEmployeePart } from '~/components/chat-message'
import { TextPart } from '~/components/parts/text-part'
import { Spinner } from '~/components/ui/spinner'

export function EmployeePart({ part }: { part: AskEmployeePart }) {
  const project = useProject()
  const team = useQuery(
    api.employees.list,
    project ? { projectId: project._id } : 'skip',
  )
  const name = part.input?.employee
  const role = team?.find((e) => e.name === name)?.role
  const who = name ? (role ? `${name} (${role})` : name) : 'the team'

  switch (part.state) {
    case 'input-streaming':
    case 'input-available':
      return (
        <div className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
          <Spinner />
          Asking {who}…
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
          <p className="mt-2 text-muted-foreground">
            <span className="font-medium text-foreground">
              {project?.name ?? 'The lead'} asked:
            </span>{' '}
            {part.input.question}
          </p>
          <div className="mt-2">
            <TextPart text={part.output.reply} />
          </div>
        </details>
      )
    case 'output-error':
      return (
        <div className="px-1.5 text-sm text-destructive">
          {who} could not answer: {part.errorText}
        </div>
      )
    default:
      return null
  }
}
