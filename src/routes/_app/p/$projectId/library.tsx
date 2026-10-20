import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAction, useConvex, useMutation, useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import { MarkdownEditor } from '~/components/markdown-editor'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { useProject } from '~/hooks/use-project'
import { errorMessage } from '~/lib/errors'

export const Route = createFileRoute('/_app/p/$projectId/library')({
  component: Library,
})

type Editing = Doc<'commands'> & { markdown: string }

/** What the assistants made and use: reminders, plans and commands. */
function Library() {
  const project = useProject()
  const commands = useQuery(
    api.api.commands.list,
    project ? { projectId: project._id } : 'skip',
  )
  const remove = useMutation(api.api.commands.remove)
  const convex = useConvex()
  // The markdown lives in Convex storage, so Edit fetches it before the form opens.
  const [editing, edit, isLoading] = React.useActionState(
    async (_previous: Editing | undefined, command: Doc<'commands'> | null) => {
      if (!command) return undefined
      const found = await convex.query(api.api.commands.get, {
        id: command._id,
      })
      const markdown = found?.url ? await (await fetch(found.url)).text() : ''
      return { ...command, markdown }
    },
    undefined,
  )
  const stopEditing = () => React.startTransition(() => edit(null))

  if (!project) {
    return project === null ? (
      <p className="p-6 text-sm text-muted-foreground">Project not found.</p>
    ) : null
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">Library</h1>
          <Reminders projectId={project._id} />
          <Plans projectId={project._id} />
          <h2 className="mt-6 font-medium">Commands</h2>
          <p className="text-sm text-muted-foreground">
            Type <code>/name</code> in a chat to have {project.name} follow a
            command. Each one is a markdown file in Convex storage.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {commands?.length === 0 && (
            <li className="text-sm text-muted-foreground">
              No commands yet. Create one below.
            </li>
          )}
          {commands?.map((c) => (
            <li
              key={c._id}
              className="flex items-start gap-3 rounded-xl border p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">/{c.name}</p>
                <p className="mt-1 text-muted-foreground">{c.description}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={isLoading}
                onClick={() => React.startTransition(() => edit(c))}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove /${c.name}`}
                onClick={() => {
                  if (editing?._id === c._id) stopEditing()
                  void remove({ id: c._id })
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>

        <CommandForm
          key={editing?._id ?? 'new'}
          projectId={project._id}
          command={editing}
          onDone={stopEditing}
        />
      </div>
    </div>
  )
}

type Values = Pick<Editing, 'name' | 'description' | 'markdown'>
type FormState = { error?: string; values?: Values }

function CommandForm({
  projectId,
  command,
  onDone,
}: {
  projectId: Id<'projects'>
  command?: Editing
  onDone: () => void
}) {
  const save = useAction(api.api.commands.save)
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      const values = {
        name: String(data.get('name')),
        description: String(data.get('description')),
        markdown: String(data.get('markdown')),
      }
      try {
        await save({ projectId, id: command?._id, ...values })
        onDone()
        return {}
      } catch (e) {
        return { error: errorMessage(e, 'Could not save. Try again.'), values }
      }
    },
    {},
  )
  const values = state.values ?? command

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="font-medium">
        {command ? `Edit /${command.name}` : 'Create a command'}
      </h2>
      <label className="flex flex-col gap-1.5 text-sm">
        Name
        <Input
          name="name"
          defaultValue={values?.name}
          required
          maxLength={32}
          placeholder="standup"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Description
        <Input
          name="description"
          defaultValue={values?.description}
          required
          maxLength={200}
          placeholder="Run a quick standup with every bot."
        />
      </label>
      <div className="flex flex-col gap-1.5 text-sm">
        What to do
        <MarkdownEditor
          name="markdown"
          defaultValue={values?.markdown}
          placeholder="Ask each bot for its top priority this week, then summarize."
          comments={
            command
              ? { projectId, kind: 'command', targetId: command._id }
              : undefined
          }
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex justify-end gap-2">
        {command && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {command ? 'Save changes' : 'Create command'}
        </Button>
      </div>
    </form>
  )
}

/** Plans assistants saved with `save_plan`. Tick steps off as you go. */
function Plans({ projectId }: { projectId: Id<'projects'> }) {
  const plans = useQuery(api.api.plans.list, { projectId })
  const toggle = useMutation(api.api.plans.toggleStep)
  const remove = useMutation(api.api.plans.remove)
  return (
    <section className="mt-4 flex flex-col gap-2">
      <h2 className="font-medium">Plans</h2>
      {plans?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No plans yet. Ask an assistant to make one.
        </p>
      )}
      {plans?.map((plan) => (
        <div key={plan._id} className="rounded-xl border p-3 text-sm">
          <div className="flex items-center gap-2">
            <p className="flex-1 font-medium">{plan.title}</p>
            <span className="text-xs text-muted-foreground">
              {plan.steps.filter((s) => s.done).length}/{plan.steps.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void remove({ id: plan._id })}
            >
              Delete
            </Button>
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {plan.steps.map((step, index) => (
              <li key={index}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={step.done}
                    onChange={() => void toggle({ id: plan._id, index })}
                    className="mt-1"
                  />
                  <span
                    className={
                      step.done ? 'text-muted-foreground line-through' : ''
                    }
                  >
                    {step.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

/** Reminders waiting to go out. */
function Reminders({ projectId }: { projectId: Id<'projects'> }) {
  const reminders = useQuery(api.api.reminders.list, { projectId })
  const cancel = useMutation(api.api.reminders.cancel)
  if (!reminders?.length) return null
  return (
    <section className="mt-4 flex flex-col gap-2">
      <h2 className="font-medium">Reminders</h2>
      <ul className="flex flex-col gap-2">
        {reminders.map((r) => (
          <li
            key={r._id}
            className="flex items-center gap-3 rounded-xl border p-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate">{r.message}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(r.dueAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}{' '}
                · {r.via} · from {r.from}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void cancel({ id: r._id })}
            >
              Cancel
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
