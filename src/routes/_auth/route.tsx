import { Navigate, Outlet, createFileRoute } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'

export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
})

/**
 * Pages for signed-out visitors; anyone signed in goes to the app. The page
 * stays mounted while auth loads, so the email-link pages keep their request.
 */
function AuthLayout() {
  const { isAuthenticated } = useConvexAuth()
  if (isAuthenticated) return <Navigate to="/projects" />
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </main>
  )
}
