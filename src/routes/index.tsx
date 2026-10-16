import * as React from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { PROVIDERS } from '../../convex/models/aiConnections/providers'
import { errorMessage } from '~/lib/errors'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'
import { Textarea } from '~/components/ui/textarea'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { edit?: string } => ({
    edit: typeof search.edit === 'string' ? search.edit : undefined,
  }),
  component: Projects,
})

function Projects() {
  const projects = useQuery(api.projects.list)
  const { edit } = Route.useSearch()
  const editing = projects?.find((p) => p._id === edit)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Each project has a lead who goes by the project's name, with their
            own team, chats and artifacts.
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

type ProjectValues = Pick<
  Doc<'projects'>,
  'name' | 'brief' | 'guidelines' | 'aiConnectionId' | 'model'
>
type FormState = { error?: string; values?: ProjectValues }

function ProjectForm({ project }: { project?: Doc<'projects'> }) {
  const save = useMutation(api.projects.save)
  const connections = useQuery(api.aiConnections.list)
  const navigate = useNavigate()
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      const values = {
        name: String(data.get('name')),
        brief: String(data.get('brief')),
        guidelines: String(data.get('guidelines')),
        aiConnectionId: connections?.find(
          (c) => c._id === data.get('aiConnectionId'),
        )?._id,
        model: String(data.get('model') ?? ''),
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
        Guidelines (the lead and every employee always follow these)
        <Textarea
          name="guidelines"
          defaultValue={values?.guidelines}
          maxLength={2000}
          placeholder="Answer in British English. Never promise delivery dates. Keep budgets under $5k unless asked."
        />
      </label>
      {connections && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            AI
            <NativeSelect
              name="aiConnectionId"
              defaultValue={values?.aiConnectionId ?? ''}
            >
              <NativeSelectOption value="">
                Convex AI Gateway
              </NativeSelectOption>
              {connections.map((c) => (
                <NativeSelectOption key={c._id} value={c._id}>
                  {c.label} · {PROVIDERS[c.provider].name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Model (optional)
            <Input
              name="model"
              defaultValue={values?.model}
              maxLength={100}
              placeholder="The connection's default"
            />
          </label>
        </div>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex justify-end gap-2">
        {project && (
          <Button variant="ghost" render={<Link to="/" />} nativeButton={false}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending || !connections}>
          {project ? 'Save changes' : 'Create project'}
        </Button>
      </div>
    </form>
  )
}
