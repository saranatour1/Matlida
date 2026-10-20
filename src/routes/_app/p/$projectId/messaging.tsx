import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { messagingAppName } from '../../../../../convex/lib/channels'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { useProject } from '~/hooks/use-project'
import { errorMessage } from '~/lib/errors'

export const Route = createFileRoute('/_app/p/$projectId/messaging')({
  component: Messaging,
})

type Action = { type: 'code' } | { type: 'unlink'; id: Id<'phoneLinks'> }

/** Link chats on iMessage, WhatsApp or Telegram, over Photon, to message the project's assistants. */
function Messaging() {
  const project = useProject()
  const links = useQuery(
    api.api.texts.links,
    project ? { projectId: project._id } : 'skip',
  )
  const startLink = useMutation(api.api.texts.startLink)
  const unlink = useMutation(api.api.texts.unlink)
  const [error, act, isPending] = React.useActionState(
    async (_previous: string | undefined, action: Action) => {
      if (!project) return undefined
      try {
        if (action.type === 'code') await startLink({ projectId: project._id })
        else await unlink({ id: action.id })
        return undefined
      } catch (e) {
        return errorMessage(e, 'Something went wrong. Try again.')
      }
    },
    undefined,
  )
  const run = (action: Action) => React.startTransition(() => act(action))

  if (!project) {
    return project === null ? (
      <p className="p-6 text-sm text-muted-foreground">Project not found.</p>
    ) : null
  }
  const pending = links?.find((l) => l.status === 'pending')
  const linked = links?.filter((l) => l.status === 'linked') ?? []
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
      <div>
        <h1 className="text-lg font-semibold">Message {project.name}</h1>
        <p className="text-sm text-muted-foreground">
          Link a chat on iMessage, WhatsApp or Telegram, then message{' '}
          {project.name} there. Start a message with @name to talk to another
          assistant, or send &ldquo;who&rdquo; to see who&rsquo;s here. Each
          assistant&rsquo;s messages also show up in a chat here. Every other
          channel is on{' '}
          <Link
            to="/p/$projectId/connections"
            params={{ projectId: project._id }}
            className="underline"
          >
            Connections
          </Link>
          .
        </p>
      </div>

      {linked.length > 0 && (
        <section className="flex flex-col divide-y rounded-xl border text-sm">
          {linked.map((link) => (
            <div key={link._id} className="flex items-center gap-3 p-4">
              <span className="size-2 rounded-full bg-emerald-500" />
              <p className="flex-1">
                {messagingAppName(link.platform ?? 'imessage')}{' '}
                <span className="text-muted-foreground">linked</span>
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => run({ type: 'unlink', id: link._id })}
              >
                Unlink
              </Button>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-xl border p-4 text-sm">
        {links === undefined ? null : pending ? (
          <>
            <p>
              From the app you want to link, send this to your Photon number on
              iMessage or WhatsApp, or to your bot on Telegram:
            </p>
            <p className="font-mono text-lg tracking-widest">
              link {pending.code}
            </p>
            <p className="text-muted-foreground">
              The code works for 10 minutes. Linking an app again replaces its
              old link.
            </p>
            <Button
              variant="outline"
              className="self-start"
              disabled={isPending}
              onClick={() => run({ type: 'code' })}
            >
              New code
            </Button>
          </>
        ) : (
          <>
            <p>
              {linked.length
                ? 'Link another app, or link one again from a different chat.'
                : 'Nothing is linked yet.'}
            </p>
            <Button
              className="self-start"
              disabled={isPending}
              onClick={() => run({ type: 'code' })}
            >
              Get a code
            </Button>
          </>
        )}
        {error && <p className="text-destructive">{error}</p>}
      </section>
    </div>
  )
}
