import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import * as React from 'react'
import { Toaster } from 'sonner'
import { Databuddy } from '@databuddy/sdk/react'
import type { QueryClient } from '@tanstack/react-query'
import { NotFoundScreen } from '~/components/error-screen'
import appCss from '~/styles/app.css?url'
import {
  DATABUDDY_CLIENT_ID,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from '~/lib/site'

const title = SITE_NAME
const description = SITE_DESCRIPTION
// Crawlers want absolute URLs; SITE_URL falls back to the production domain.
const ogImage = `${SITE_URL}/og.png`

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title },
      { name: 'description', content: description },
      { name: 'theme-color', content: '#0a0a0a' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: `${SITE_URL}/` },
      { property: 'og:site_name', content: title },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: ogImage },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      {
        property: 'og:image:alt',
        content: 'Matilda, the assistant that actually calls you',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: ogImage },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap',
      },
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  notFoundComponent: NotFoundScreen,
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {/* Failures from clicks (`attempt`) show here. */}
        <Toaster theme="system" position="bottom-center" richColors />
        <Databuddy
          clientId={DATABUDDY_CLIENT_ID}
          trackWebVitals
          trackErrors
          trackInteractions
          // Localhost is ignored unless debugging, so dev logs what it would send.
          debug={import.meta.env.DEV}
          // These links carry one-time codes in the URL.
          skipPatterns={[
            '/reset-password',
            '/reset-password/**',
            '/verify-email',
            '/verify-email/**',
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
