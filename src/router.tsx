import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { ConvexQueryClient } from '@convex-dev/react-query'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { routeTree } from './routeTree.gen'
import { api } from '~/lib/api'
import { ErrorScreen, NotFoundScreen } from '~/components/error-screen'

export function getRouter() {
  const CONVEX_URL = (import.meta as any).env.VITE_CONVEX_URL!
  if (!CONVEX_URL) {
    console.error('missing envar CONVEX_URL')
  }
  const convexQueryClient = new ConvexQueryClient(CONVEX_URL)

  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        gcTime: 5000,
      },
    },
  })
  convexQueryClient.connect(queryClient)

  const router = createRouter({
    routeTree,
    defaultPreload: 'intent',
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0, // Let React Query handle all caching
    defaultErrorComponent: ErrorScreen,
    defaultNotFoundComponent: NotFoundScreen,
    Wrap: ({ children }) => (
      <ConvexAuthProvider
        client={convexQueryClient.convexClient}
        api={{
          refreshSession: api.auth.refreshSession,
          signOut: api.auth.signOut,
        }}
      >
        {children}
      </ConvexAuthProvider>
    ),
  })
  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}
