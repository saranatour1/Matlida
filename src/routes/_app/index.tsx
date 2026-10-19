import { Link, Navigate, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { z } from 'zod'
import { api } from '../../../convex/_generated/api'
import { ProjectForm } from '~/components/project-form'
import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/_app/')({
  validateSearch: z.object({ create: z.boolean().optional() }),
  component: Projects,
})

function Projects() {
  const projects = useQuery(api.api.projects.list)
  const { create } = Route.useSearch()
  const first = projects?.at(0)
  if (first && !create) {
    return <Navigate to="/p/$projectId" params={{ projectId: first._id }} />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">Workspaces</h1>
          <p className="text-sm text-muted-foreground">
            Each workspace has a lead assistant, Matilda by default, with its
            own chats.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {projects?.length === 0 && (
            <li className="text-sm text-muted-foreground">
              No workspaces yet. Create the first one below.
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
                render={
                  <Link
                    to="/p/$projectId/settings"
                    params={{ projectId: p._id }}
                  />
                }
                nativeButton={false}
              >
                Settings
              </Button>
            </li>
          ))}
        </ul>

        <ProjectForm />
      </div>
    </div>
  )
}
