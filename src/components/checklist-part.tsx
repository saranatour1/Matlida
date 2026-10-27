import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ListChecksIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import type { Doc } from '@convex/_generated/dataModel'
import { api } from '~/lib/api'
import { ToolStatus } from '~/components/tool-part'
import { Button } from '~/components/ui/button'
import { attempt } from '~/lib/attempt'
import { CardSkeleton } from '~/components/card-skeleton'

type ChecklistToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-save_plan' | 'tool-add_to_list' }
>

/** A plan or list an assistant saved, live: tick items off right in the chat. */
export function ChecklistPart({ part }: { part: ChecklistToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    const what = part.type === 'tool-save_plan' ? 'the plan' : 'the list'
    return (
      <ToolStatus failed={failed} icon={ListChecksIcon}>
        {failed ? `Couldn’t save ${what}.` : `Saving ${what}…`}
      </ToolStatus>
    )
  }
  return <Checklist id={part.output.planId} />
}

function Checklist({ id }: { id: string }) {
  const { projectId } = useParams({ strict: false })
  const plan = useQuery(api.plans.get, { id })
  const toggle = useMutation(api.plans.toggleStep).withOptimisticUpdate(
    (store, { index }) => {
      const current = store.getQuery(api.plans.get, { id })
      if (!current) return
      store.setQuery(
        api.plans.get,
        { id },
        {
          ...current,
          steps: current.steps.map((s, i) =>
            i === index ? { ...s, done: !s.done } : s,
          ),
        },
      )
    },
  )
  const clearDone = useMutation(api.plans.clearDone)
  if (plan === undefined) return <CardSkeleton />
  if (plan === null) {
    return (
      <p className="px-1.5 text-sm text-muted-foreground">
        This list was deleted.
      </p>
    )
  }
  const done = plan.steps.filter((s) => s.done).length
  return (
    <section
      aria-label={plan.title}
      className="mx-1.5 flex max-w-md flex-col gap-2 rounded-xl border bg-card p-3 text-sm text-card-foreground"
    >
      <div className="flex items-center gap-2">
        <ListChecksIcon className="size-4 text-muted-foreground" />
        <p className="flex-1 truncate font-medium">{plan.title}</p>
        <span className="text-xs text-muted-foreground tabular-nums">
          {done}/{plan.steps.length}
        </span>
      </div>
      {plan.steps.length === 0 && (
        <p className="text-muted-foreground">Nothing on it yet.</p>
      )}
      {sections(plan).map(([section, steps]) => (
        <div key={section ?? ''} className="flex flex-col gap-1">
          {section && (
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {section}
            </p>
          )}
          {steps.map(({ step, index }) => (
            <label key={index} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={step.done}
                onChange={() => void attempt(toggle({ id: plan._id, index }))}
                className="mt-1"
              />
              <span
                className={
                  step.done ? 'text-muted-foreground line-through' : undefined
                }
              >
                {step.text}
              </span>
            </label>
          ))}
        </div>
      ))}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {done > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => void attempt(clearDone({ id: plan._id }))}
          >
            Clear done
          </Button>
        )}
        {projectId && (
          <Link
            to="/p/$projectId/library"
            params={{ projectId }}
            className="ml-auto underline hover:text-foreground"
          >
            In the Library
          </Link>
        )}
      </div>
    </section>
  )
}

type Step = Doc<'plans'>['steps'][number]

/** The steps grouped by section, in the order sections first appear, keeping each step's index. */
function sections(plan: Doc<'plans'>) {
  const groups = new Map<
    string | undefined,
    Array<{ step: Step; index: number }>
  >()
  plan.steps.forEach((step, index) => {
    const group = groups.get(step.section) ?? []
    group.push({ step, index })
    groups.set(step.section, group)
  })
  return [...groups]
}
