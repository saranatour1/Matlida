import * as React from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
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

function ProjectForm({ project }: { project?: Doc<'projects'> }) {
  const save = useMutation(api.projects.save)
  const navigate = useNavigate()
  const [error, setError] = React.useState<string>()

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setError(undefined)
    try {
      const id = await save({
        id: project?._id,
        name: String(data.get('name')),
        brief: String(data.get('brief')),
      })
      if (project) {
        void navigate({ to: '/', search: {} })
      } else {
        void navigate({ to: '/p/$projectId', params: { projectId: id } })
      }
    } catch (e) {
      setError(
        e instanceof ConvexError
          ? String(e.data)
          : 'Could not save. Try again.',
      )
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border p-4"
    >
      <h2 className="font-medium">
        {project ? `Edit ${project.name}` : 'New project'}
      </h2>
      <label className="flex flex-col gap-1.5 text-sm">
        Name (the lead goes by this name too)
        <Input
          name="name"
          defaultValue={project?.name}
          required
          maxLength={40}
          placeholder="Matilda"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Brief
        <Textarea
          name="brief"
          defaultValue={project?.brief}
          maxLength={2000}
          placeholder="A small coffee roastery selling online. This quarter: launch subscriptions."
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        {project && (
          <Button variant="ghost" render={<Link to="/" />} nativeButton={false}>
            Cancel
          </Button>
        )}
        <Button type="submit">
          {project ? 'Save changes' : 'Create project'}
        </Button>
      </div>
    </form>
  )
}
