import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { z } from 'zod'
import { api } from '../../../../../convex/_generated/api'
import { portraitOf } from '~/components/bot-avatar'
import { Chat } from '~/components/chat'
import { NewAssistantDialog } from '~/components/new-assistant-dialog'
import { SidebarTrigger } from '~/components/ui/sidebar'
import { useCall } from '~/components/voice-call'
import { useProject } from '~/hooks/use-project'
import { decodeTemplate } from '~/lib/bot-template'

export const Route = createFileRoute('/_app/p/$projectId/')({
  validateSearch: z.object({
    thread: z.string().optional(),
    bot: z.string().optional(),
    panel: z.boolean().optional(),
    /** Opens the New assistant dialog. */
    new: z.boolean().optional(),
    /** A shared assistant to copy, from a template link. */
    template: z.string().optional(),
  }),
  component: ProjectPage,
})

/**
 * A chat with one of the project's assistants. `?bot=<id>` picks a bot (the
 * lead otherwise), `?thread=<id>` opens a chat, no thread starts a new one.
 * `?new=true` or `?template=<link>` opens the New assistant dialog over it.
 */
function ProjectPage() {
  const project = useProject()
  const search = Route.useSearch()
  const { thread, bot: botId, panel } = search
  const navigate = Route.useNavigate()
  const template = decodeTemplate(search.template)
  const bots = useQuery(
    api.api.bots.list,
    project && botId ? { projectId: project._id } : 'skip',
  )
  const bot = bots?.find((b) => b._id === botId)
  const { startCall } = useCall()
  if (project === undefined || (botId && bots === undefined)) return null
  if (project === null) {
    return (
      <>
        <header className="flex items-center gap-2 px-4 py-3">
          <SidebarTrigger />
        </header>
        <div className="px-6 text-sm">
          Project not found.{' '}
          <Link to="/" className="underline">
            Back to projects
          </Link>
        </div>
      </>
    )
  }
  return (
    <>
      <Chat
        key={`${botId ?? 'lead'}/${thread ?? 'new'}`}
        project={project}
        bot={bot}
        threadId={thread}
        panel={panel}
        onCall={() =>
          startCall(
            { projectId: project._id, botId: bot?._id, threadId: thread },
            {
              name: (bot ?? project).name,
              portrait: portraitOf(bot ?? project),
            },
          )
        }
      />
      {(search.new || template) && (
        <NewAssistantDialog
          projectId={project._id}
          template={template ?? undefined}
          onClose={() =>
            void navigate({
              search: (prev) => ({
                ...prev,
                new: undefined,
                template: undefined,
              }),
            })
          }
        />
      )}
    </>
  )
}
