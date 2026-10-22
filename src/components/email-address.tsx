import * as React from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { errorMessage } from '~/lib/errors'

type Action = { type: 'claim'; handle: string } | { type: 'release' }

/**
 * Your assistant address at the mail domain: claim one here, bring it to
 * this workspace when another answers it, or release it. Shown under the
 * Email row on Connections once the deployment has a mail domain.
 */
export function EmailAddress({ project }: { project: Doc<'projects'> }) {
  const mine = useQuery(api.api.mailboxes.mine)
  const claim = useMutation(api.api.mailboxes.claim)
  const release = useMutation(api.api.mailboxes.release)
  const [error, act, isPending] = React.useActionState(
    async (_previous: string | undefined, action: Action) => {
      try {
        if (action.type === 'claim') {
          await claim({ projectId: project._id, handle: action.handle })
        } else {
          await release()
        }
        return undefined
      } catch (e) {
        return errorMessage(e, 'Something went wrong. Try again.')
      }
    },
    undefined,
  )
  const run = (action: Action) => React.startTransition(() => act(action))

  if (!mine?.domain) return null
  if (!mine.email) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Verify your sign-in email first. Your assistants only write to it.
      </p>
    )
  }
  const { mailbox } = mine
  if (mailbox?.address && mailbox.projectId === project._id) {
    return (
      <div className="mt-2 flex flex-col gap-2 text-xs">
        <p>
          Write to <span className="font-medium">{mailbox.address}</span> from
          anywhere and it shows in {project.name}&rsquo;s chat with a draft
          reply. Nothing is sent until you press Reply.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => run({ type: 'release' })}
          >
            Release address
          </Button>
          {error && <span className="text-destructive">{error}</span>}
        </div>
      </div>
    )
  }
  if (mailbox?.address) {
    return (
      <div className="mt-2 flex flex-col gap-2 text-xs">
        <p>
          <span className="font-medium">{mailbox.address}</span> answers in
          another workspace. Bring it here and {project.name} drafts the replies
          instead.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => run({ type: 'claim', handle: mailbox.handle })}
          >
            Use it here
          </Button>
          {error && <span className="text-destructive">{error}</span>}
        </div>
      </div>
    )
  }
  return (
    <form
      className="mt-2 flex flex-col gap-2 text-xs"
      action={(data) =>
        run({ type: 'claim', handle: String(data.get('handle') ?? '') })
      }
    >
      <p>
        Pick a handle. Mail to it shows in the app, and {project.name} drafts a
        reply you can edit and send.
      </p>
      <div className="flex items-center gap-2">
        <Input
          name="handle"
          required
          minLength={3}
          maxLength={32}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="handle"
          className="h-8 max-w-48"
        />
        <span className="text-muted-foreground">@{mine.domain}</span>
        <Button type="submit" size="sm" disabled={isPending}>
          Claim
        </Button>
      </div>
      <p className="text-muted-foreground">
        3 to 32 lowercase letters, digits, dots, dashes or underscores. Role
        names like postmaster are reserved.
      </p>
      {error && <p className="text-destructive">{error}</p>}
    </form>
  )
}
