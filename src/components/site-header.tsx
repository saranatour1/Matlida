import { Link } from '@tanstack/react-router'

import { useProject } from '~/hooks/use-project'
import { NewChatButton } from '~/components/new-chat-button'
import { SidebarTrigger } from '~/components/ui/sidebar'

export function SiteHeader() {
  const project = useProject()
  return (
    <header className="flex items-center gap-2 px-4 py-3">
      <SidebarTrigger />
      {project ? (
        <Link
          to="/p/$projectId"
          params={{ projectId: project._id }}
          className="text-sm font-medium"
        >
          {project.name}
        </Link>
      ) : (
        <Link to="/" className="text-sm font-medium">
          Projects
        </Link>
      )}
      {project && (
        <div className="ml-auto">
          <NewChatButton projectId={project._id} />
        </div>
      )}
    </header>
  )
}
