import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAction, useConvex, useMutation, useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { useProject } from '~/hooks/use-project'
import { errorMessage } from '~/lib/errors'

export const Route = createFileRoute('/_app/p/$projectId/commands')({
  component: Commands,
})

type Editing = Doc<'commands'> & { markdown: string }

function Commands() {
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
          <h1 className="text-lg font-semibold">Commands</h1>
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
      <label className="flex flex-col gap-1.5 text-sm">
        What to do (markdown)
        <Textarea
          name="markdown"
          defaultValue={values?.markdown}
          required
          maxLength={20_000}
          rows={8}
          className="font-mono text-xs"
          placeholder={
            '# Standup\n\nAsk each bot for its top priority this week, then summarize.'
          }
        />
      </label>
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
