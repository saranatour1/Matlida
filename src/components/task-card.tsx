import { useMutation, useQuery } from 'convex/react'
import {
  CheckIcon,
  CircleIcon,
  CircleSlashIcon,
  ListChecksIcon,
  XIcon,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { ChatUIMessage } from '~/components/chat-message'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'

type RunPlanPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-run_plan' }
>

export const TASK_STATUS: Record<Doc<'tasks'>['status'], string> = {
  waiting_for_you: 'Waiting for you',
  running: 'Working',
  done: 'Done',
  failed: 'Stopped',
  cancelled: 'Cancelled',
}

/** The `run_plan` tool's card: the task's steps, live, with Start or Cancel. */
export function RunPlanPart({ part }: { part: RunPlanPart }) {
  if (part.state === 'output-error') {
    return (
      <p className="px-1.5 text-sm text-muted-foreground">
        Couldn&rsquo;t start the plan: {part.errorText}
      </p>
    )
  }
  if (part.state !== 'output-available') {
    return (
      <div className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
        <Spinner /> Setting up the task…
      </div>
    )
  }
  return <TaskCard taskId={part.output.taskId as Id<'tasks'>} />
}

export function TaskCard({ taskId }: { taskId: Id<'tasks'> }) {
  const task = useQuery(api.api.tasks.get, { taskId })
  const answer = useMutation(api.api.tasks.answer)
  const cancel = useMutation(api.api.tasks.cancel)
  if (!task) return null
  return (
    <section
      aria-label={`Task: ${task.title}`}
      className="mx-1.5 flex flex-col gap-2 rounded-xl border p-3 text-sm"
    >
      <div className="flex items-center gap-2">
        <ListChecksIcon className="size-4 text-muted-foreground" />
        <span className="font-medium">{task.title}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {TASK_STATUS[task.status]}
        </span>
      </div>
      <ol className="flex flex-col gap-1.5">
        {task.steps.map((step, i) => (
          <li key={i} className="flex gap-2">
            <StepIcon status={step.status} />
            <span className="flex min-w-0 flex-col">
              <span
                className={
                  step.status === 'skipped'
                    ? 'text-muted-foreground line-through'
                    : undefined
                }
              >
                {step.name}
              </span>
              {step.detail && (
                <span className="text-xs text-muted-foreground">
                  {step.detail}
                </span>
              )}
              {step.startedAt && step.endedAt && (
                <span className="text-xs text-muted-foreground">
                  {Math.max(
                    1,
                    Math.round((step.endedAt - step.startedAt) / 1000),
                  )}
                  s
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {task.status === 'waiting_for_you' && (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => void answer({ taskId, start: true })}
          >
            Start
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void answer({ taskId, start: false })}
          >
            Don&rsquo;t start
          </Button>
        </div>
      )}
      {task.status === 'running' && (
        <div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void cancel({ taskId })}
          >
            Cancel
          </Button>
        </div>
      )}
    </section>
  )
}

function StepIcon({
  status,
}: {
  status: Doc<'tasks'>['steps'][number]['status']
}) {
  const className = 'mt-0.5 size-4 shrink-0'
  if (status === 'running') return <Spinner className={className} />
  if (status === 'done') return <CheckIcon className={className} />
  if (status === 'failed')
    return <XIcon className={`${className} text-destructive`} />
  if (status === 'skipped')
    return <CircleSlashIcon className={`${className} text-muted-foreground`} />
  return <CircleIcon className={`${className} text-muted-foreground`} />
}
