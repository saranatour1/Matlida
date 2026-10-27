import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { z } from 'zod'
import { api } from '@convex/_generated/api'
import { Chat } from '~/components/chat'
import { NewAssistantDialog } from '~/components/new-assistant-dialog'
import { SidebarTrigger } from '~/components/ui/sidebar'
import { useProject } from '~/hooks/use-project'
import { decodeTemplate } from '~/lib/bot-template'

export const Route = createFileRoute('/_app/p/$projectId/')({
  validateSearch: z.object({
    bot: z.string().optional(),
    panel: z.boolean().optional(),
    /** Opens the New assistant dialog. */
    new: z.boolean().optional(),
    /** A shared assistant to copy, from a template link. */
    template: z.string().optional(),
    /** A message to start the box with, like "Email Luke at …: " from Contacts. */
    draft: z.string().max(500).optional(),
  }),
  component: ProjectPage,
})

/**
 * The chat with one of the project's assistants. `?bot=<id>` picks a bot (the
 * lead otherwise). Each has one chat.
 * `?new=true` or `?template=<link>` opens the New assistant dialog over it.
 */
function ProjectPage() {
  const project = useProject()
  const search = Route.useSearch()
  const { bot: botId, panel } = search
  const navigate = Route.useNavigate()
  const template = decodeTemplate(search.template)
  const bots = useQuery(
    api.api.bots.list,
    project && botId ? { projectId: project._id } : 'skip',
  )
  const bot = bots?.find((b) => b._id === botId)
  if (project === undefined || (botId && bots === undefined)) return null
  if (project === null) {
    return (
      <>
        <header className="flex items-center gap-2 px-4 py-3">
          <SidebarTrigger />
        </header>
        <div className="px-6 text-sm">
          Project not found.{' '}
          <Link to="/projects" className="underline">
            Back to projects
          </Link>
        </div>
      </>
    )
  }
  return (
    <>
      <Chat
        key={botId ?? 'lead'}
        project={project}
        bot={bot}
        panel={panel}
        draft={search.draft}
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
