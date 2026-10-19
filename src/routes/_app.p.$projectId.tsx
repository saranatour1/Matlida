import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Chat } from '~/components/chat'
import { useProject } from '~/hooks/use-project'

export const Route = createFileRoute('/_app/p/$projectId')({
  validateSearch: z.object({ thread: z.string().optional() }),
  component: ProjectPage,
})

/** A project's chats: `?thread=<id>` opens one, no thread starts a new one. */
function ProjectPage() {
  const project = useProject()
  const { thread } = Route.useSearch()
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
  return <Chat key={thread ?? 'new'} project={project} threadId={thread} />
}
