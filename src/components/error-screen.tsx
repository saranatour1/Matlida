import { Link, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'

/** What a page shows when it crashes: a way to retry or leave, and the details only in development. */
export function ErrorScreen({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-medium">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page hit an error. Try again, and if it keeps happening, go back
        home.
      </p>
      {import.meta.env.DEV && (
        <pre className="max-h-48 max-w-xl overflow-auto rounded-md bg-muted p-3 text-left text-xs">
          {error instanceof Error ? error.stack : String(error)}
        </pre>
      )}
      <div className="flex gap-2">
        <Button
          onClick={() => {
            reset()
            void router.invalidate()
          }}
        >
          Try again
        </Button>
        <Button variant="outline" render={<Link to="/" />} nativeButton={false}>
          Home
        </Button>
      </div>
    </main>
  )
}

export function NotFoundScreen() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-medium">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        That link doesn’t go anywhere in Matilda.
      </p>
      <Button variant="outline" render={<Link to="/" />} nativeButton={false}>
        Home
      </Button>
    </main>
  )
}
