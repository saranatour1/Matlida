import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { z } from 'zod'
import { api } from '../../../../../convex/_generated/api'
import { Chat } from '~/components/chat'
import { useProject } from '~/hooks/use-project'

export const Route = createFileRoute('/_app/p/$projectId/')({
  validateSearch: z.object({
    thread: z.string().optional(),
    bot: z.string().optional(),
    panel: z.boolean().optional(),
  }),
  component: ProjectPage,
})

/**
 * A chat with one of the project's assistants. `?bot=<id>` picks a bot (the
 * lead otherwise), `?thread=<id>` opens a chat, no thread starts a new one.
 */
function ProjectPage() {
  const project = useProject()
  const { thread, bot: botId, panel } = Route.useSearch()
  const bots = useQuery(
    api.api.bots.list,
    project && botId ? { projectId: project._id } : 'skip',
  )
  const bot = bots?.find((b) => b._id === botId)
  if (project === undefined || (botId && bots === undefined)) return null
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
    <Chat
      key={`${botId ?? 'lead'}/${thread ?? 'new'}`}
      project={project}
      bot={bot}
      threadId={thread}
      panel={panel}
    />
  )
}
