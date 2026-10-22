import { createFileRoute } from '@tanstack/react-router'
import { JOBS, MODELS, modelName } from '@convex/lib/models'
import type { Job } from '@convex/lib/models'
import { useProject } from '~/hooks/use-project'

export const Route = createFileRoute('/_app/p/$projectId/models')({
  component: Models,
})

/** Jobs by their group, in the order the map lists them. */
const GROUPS = Object.entries(JOBS).reduce<
  Array<{ group: string; jobs: Array<Job> }>
>((groups, [job, { group }]) => {
  const found = groups.find((g) => g.group === group)
  if (found) found.jobs.push(job as Job)
  else groups.push({ group, jobs: [job as Job] })
  return groups
}, [])

/** Which model does which job, all through the Convex AI gateway. Straight from `convex/lib/models.ts`. */
function Models() {
  const project = useProject()
  if (!project) return null
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">Models</h1>
          <p className="text-sm text-muted-foreground">
            Which model does each job, all through the Convex AI gateway.
          </p>
        </div>
        {GROUPS.map(({ group, jobs }) => (
          <section
            key={group}
            aria-labelledby={group}
            className="flex flex-col gap-2"
          >
            <h2 id={group} className="text-sm font-medium">
              {group}
            </h2>
            <ul className="flex flex-col divide-y rounded-xl border">
              {jobs.map((job) => (
                <li key={job} className="flex flex-col gap-1 p-4 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{JOBS[job].name}</span>
                    <span className="ml-auto text-right">
                      {job === 'chat' && project.model
                        ? modelName(project.model)
                        : JOBS[job].model}
                      <span className="text-muted-foreground">
                        {' '}
                        · {JOBS[job].maker}
                      </span>
                    </span>
                  </div>
                  <p className="text-muted-foreground">{JOBS[job].note}</p>
                  <code className="text-xs text-muted-foreground">
                    {job === 'chat' && project.model
                      ? `${project.model} (this workspace’s pick)`
                      : MODELS[job]}
                  </code>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
