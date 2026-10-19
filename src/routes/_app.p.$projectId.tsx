import { Link, createFileRoute } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'
import { useProject } from '~/hooks/use-project'

export const Route = createFileRoute('/_app/p/$projectId')({
  component: ProjectPage,
})

function ProjectPage() {
  const project = useProject()
  if (project === undefined) return null
  if (project === null) {
    return (
      <div className="p-6 text-sm">
        Project not found.{' '}
        <Link to="/" className="underline">
          Back to projects
        </Link>
      </div>
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">{project.name}</h1>
          {project.brief && (
            <p className="text-sm text-muted-foreground">{project.brief}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/" search={{ edit: project._id }} />}
          nativeButton={false}
        >
          Edit
        </Button>
      </div>
      {project.guidelines && (
        <section className="rounded-xl border p-4 text-sm">
          <h2 className="mb-1 font-medium">Guidelines</h2>
          <p className="whitespace-pre-wrap text-muted-foreground">
            {project.guidelines}
          </p>
        </section>
      )}
    </div>
  )
}
