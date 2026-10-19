import * as React from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { z } from 'zod'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { errorMessage } from '~/lib/errors'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'

export const Route = createFileRoute('/_app/')({
  validateSearch: z.object({ edit: z.string().optional() }),
  component: Projects,
})

function Projects() {
  const projects = useQuery(api.api.projects.list)
  const { edit } = Route.useSearch()
  const editing = projects?.find((p) => p._id === edit)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Each project has a lead who goes by the project's name, with its own
            chats.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {projects?.length === 0 && (
            <li className="text-sm text-muted-foreground">
              No projects yet. Create the first one below.
            </li>
          )}
          {projects?.map((p) => (
            <li
              key={p._id}
              className="flex items-start gap-3 rounded-xl border p-3 text-sm"
            >
              <Link
                to="/p/$projectId"
                params={{ projectId: p._id }}
                className="min-w-0 flex-1"
              >
                <p className="font-medium">{p.name}</p>
                {p.brief && (
                  <p className="mt-1 line-clamp-2 text-muted-foreground">
                    {p.brief}
                  </p>
                )}
              </Link>
              <Button
                variant="ghost"
                size="sm"
                render={<Link to="/" search={{ edit: p._id }} />}
                nativeButton={false}
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>

        <ProjectForm key={editing?._id ?? 'new'} project={editing} />
      </div>
    </div>
  )
}

type ProjectValues = Pick<Doc<'projects'>, 'name' | 'brief' | 'guidelines'>
type FormState = { error?: string; values?: ProjectValues }

function ProjectForm({ project }: { project?: Doc<'projects'> }) {
  const save = useMutation(api.api.projects.save)
  const navigate = useNavigate()
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      const values = {
        name: String(data.get('name')),
        brief: String(data.get('brief')),
        guidelines: String(data.get('guidelines')),
      }
      try {
        const id = await save({ id: project?._id, ...values })
        if (project) {
          void navigate({ to: '/', search: {} })
        } else {
          void navigate({ to: '/p/$projectId', params: { projectId: id } })
        }
        return {}
      } catch (e) {
        return { error: errorMessage(e, 'Could not save. Try again.'), values }
      }
    },
    {},
  )
  const values = state.values ?? project

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="font-medium">
        {project ? `Edit ${project.name}` : 'New project'}
      </h2>
      <label className="flex flex-col gap-1.5 text-sm">
        Name (the lead goes by this name too)
        <Input
          name="name"
          defaultValue={values?.name}
          required
          maxLength={40}
          placeholder="Matilda"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Brief
        <Textarea
          name="brief"
          defaultValue={values?.brief}
          maxLength={2000}
          placeholder="A small coffee roastery selling online. This quarter: launch subscriptions."
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Guidelines (the lead and every bot always follow these)
        <Textarea
          name="guidelines"
          defaultValue={values?.guidelines}
          maxLength={2000}
          placeholder="Answer in British English. Never promise delivery dates. Keep budgets under $5k unless asked."
        />
      </label>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex justify-end gap-2">
        {project && (
          <Button variant="ghost" render={<Link to="/" />} nativeButton={false}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {project ? 'Save changes' : 'Create project'}
        </Button>
      </div>
    </form>
  )
}
