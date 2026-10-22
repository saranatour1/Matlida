import { Navigate, createFileRoute } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { PhoneIcon } from 'lucide-react'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '~/lib/site'

export const Route = createFileRoute('/')({
  validateSearch: z.object({
    /** Share links from before /projects carried this; they still open the template. */
    template: z.string().optional(),
  }),
  head: () => ({
    meta: [{ title: `${SITE_NAME}: the assistant that actually calls you` }],
    links: [{ rel: 'canonical', href: `${SITE_URL}/` }],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          description: SITE_DESCRIPTION,
          applicationCategory: 'ProductivityApplication',
          operatingSystem: 'Web',
          image: `${SITE_URL}/og.png`,
        }),
      },
    ],
  }),
  component: Landing,
})

/**
 * The public front page: Matilda, and the one thing that sets her apart.
 * It renders on the server for crawlers; anyone signed in goes to the app.
 */
function Landing() {
  const { isAuthenticated } = useConvexAuth()
  const { template } = Route.useSearch()
  if (isAuthenticated || template) {
    return <Navigate to="/projects" search={{ template }} />
  }
  return (
    <main className="flex min-h-svh flex-col items-center justify-between bg-background px-6 py-10 text-foreground">
      <div />
      <section className="flex flex-col items-center gap-6 text-center">
        <img
          src="/avatars/matilda.jpg"
          alt="Matilda"
          width={160}
          height={160}
          className="size-40 rounded-[28%] object-cover shadow-lg"
        />
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          She actually calls you.
        </h1>
        <Button
          className="size-16 rounded-full bg-emerald-600 text-white hover:bg-emerald-500 [&_svg]:size-7"
          aria-label="Sign in and get a call from Matilda"
          title="Sign in and get a call from Matilda"
          render={<a href="/sign-in" />}
          nativeButton={false}
        >
          <PhoneIcon />
        </Button>
        <p className="text-sm text-muted-foreground">
          because I made her that way
        </p>
      </section>
      <MadeWithConvex />
    </main>
  )
}

/** "Made with Convex", with Convex's own symbol from their brand kit (unaltered), linking to convex.dev. */
function MadeWithConvex() {
  return (
    <a
      href="https://www.convex.dev"
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <img src="/convex-symbol.svg" alt="" width={22} height={22} />
      Made with Convex
    </a>
  )
}
