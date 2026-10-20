import { Link, createFileRoute } from '@tanstack/react-router'
import { AccountForm } from '~/components/account-form'
import { ProjectForm } from '~/components/project-form'
import { useProject } from '~/hooks/use-project'

export const Route = createFileRoute('/_app/p/$projectId/settings')({
  component: Settings,
})

function Settings() {
  const project = useProject()
  if (!project) return null
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            The workspace, its lead and the rules every assistant follows.
          </p>
        </div>
        <ProjectForm key={project._id} project={project} />
        <section className="flex flex-col gap-1 rounded-xl border p-4 text-sm">
          <h2 className="font-medium">Connections</h2>
          <p className="text-muted-foreground">
            Email, iMessage, Telegram and WhatsApp, and what the assistants can
            use.{' '}
            <Link
              to="/p/$projectId/connections"
              params={{ projectId: project._id }}
              className="underline"
            >
              See every connection
            </Link>
          </p>
        </section>
        <AccountForm />
      </div>
    </div>
  )
}
