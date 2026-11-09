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
    <main className="relative flex min-h-svh flex-col items-center justify-between bg-background px-6 py-10 text-foreground">
      <a
        href="https://github.com/saranatour1/Matlida"
        target="_blank"
        rel="noreferrer"
        aria-label="Matilda on GitHub"
        title="Matilda on GitHub"
        className="absolute top-4 right-4 rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor" aria-hidden>
          <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
        </svg>
      </a>
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
