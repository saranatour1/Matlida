import {
  Link,
  Navigate,
  Outlet,
  createFileRoute,
  useMatch,
} from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { AppSidebar } from '~/components/app-sidebar'
import { IncomingCall } from '~/components/incoming-call'
import { CallProvider } from '~/components/voice-call'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '~/components/ui/sidebar'
import { TooltipProvider } from '~/components/ui/tooltip'
import { useProject } from '~/hooks/use-project'

export const Route = createFileRoute('/_app')({
  component: AppLayout,
})

/** Pages for signed-in users, with the sidebar. */
function AppLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  // The chat draws its own header, with the assistant and its actions.
  const inChat = useMatch({ from: '/_app/p/$projectId/', shouldThrow: false })
  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to="/sign-in" />
  return (
    <TooltipProvider>
      <CallProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="h-svh min-h-0">
            {!inChat && <Header />}
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
        <IncomingCall />
      </CallProvider>
    </TooltipProvider>
  )
}

function Header() {
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
    </header>
  )
}
