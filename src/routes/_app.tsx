import { Navigate, Outlet, createFileRoute } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'

export const Route = createFileRoute('/_app')({
  component: AppLayout,
})

/** Pages for signed-in users. */
function AppLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to="/sign-in" />
  return <Outlet />
}
