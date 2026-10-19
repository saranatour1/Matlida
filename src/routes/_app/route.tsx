import { Link, Navigate, Outlet, createFileRoute } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { AppSidebar } from '~/components/app-sidebar'
import { IncomingCall } from '~/components/incoming-call'
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
  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to="/sign-in" />
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="h-svh min-h-0">
          <Header />
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
      <IncomingCall />
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
