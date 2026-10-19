import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { useProject } from '~/hooks/use-project'
import { errorMessage } from '~/lib/errors'

export const Route = createFileRoute('/_app/p/$projectId/texting')({
  component: Texting,
})

/** Link a phone so the project's lead answers texts, over Photon. */
function Texting() {
  const project = useProject()
  const link = useQuery(
    api.api.texts.link,
    project ? { projectId: project._id } : 'skip',
  )
  const startLink = useMutation(api.api.texts.startLink)
  const unlink = useMutation(api.api.texts.unlink)
  const [error, act, isPending] = React.useActionState(
    async (_previous: string | undefined, action: 'code' | 'unlink') => {
      if (!project) return undefined
      try {
        if (action === 'code') await startLink({ projectId: project._id })
        else await unlink({ projectId: project._id })
        return undefined
      } catch (e) {
        return errorMessage(e, 'Something went wrong. Try again.')
      }
    },
    undefined,
  )
  const run = (action: 'code' | 'unlink') =>
    React.startTransition(() => act(action))

  if (!project) {
    return project === null ? (
      <p className="p-6 text-sm text-muted-foreground">Project not found.</p>
    ) : null
  }
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
      <div>
        <h1 className="text-lg font-semibold">Text {project.name}</h1>
        <p className="text-sm text-muted-foreground">
          Link your phone, then text your Photon number and {project.name}{' '}
          replies there. Texts and replies also show up in a chat called Texts.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border p-4 text-sm">
        {link === undefined ? null : link === null ? (
          <>
            <p>No phone is linked yet.</p>
            <Button
              className="self-start"
              disabled={isPending}
              onClick={() => run('code')}
            >
              Get a code
            </Button>
          </>
        ) : link.status === 'pending' ? (
          <>
            <p>From your phone, text this to your Photon number:</p>
            <p className="font-mono text-lg tracking-widest">
              link {link.code}
            </p>
            <p className="text-muted-foreground">
              The code works for 10 minutes.
            </p>
            <Button
              variant="outline"
              className="self-start"
              disabled={isPending}
              onClick={() => run('code')}
            >
              New code
            </Button>
          </>
        ) : (
          <>
            <p>Your phone is linked. Text your Photon number anytime.</p>
            <Button
              variant="outline"
              className="self-start"
              disabled={isPending}
              onClick={() => run('unlink')}
            >
              Unlink
            </Button>
          </>
        )}
        {error && <p className="text-destructive">{error}</p>}
      </section>
    </div>
  )
}
