import * as React from 'react'
import { useMutation } from 'convex/react'
import { MailIcon } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { errorMessage } from '~/lib/errors'
import type { SendEmailPart } from '~/components/chat-message'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'

/** An email the lead wants to send. Nothing goes out until the user presses Send. */
export function EmailPart({
  part,
  threadId,
}: {
  part: SendEmailPart
  threadId?: string
}) {
  const decide = useMutation(api.chat.decide)
  const [error, answer, isPending] = React.useActionState(
    async (_previous: string | undefined, approved: boolean) => {
      if (!threadId || part.state !== 'approval-requested') return undefined
      try {
        await decide({ threadId, approvalId: part.approval.id, approved })
        return undefined
      } catch (e) {
        return errorMessage(e, 'Could not save your answer. Try again.')
      }
    },
    undefined,
  )

  switch (part.state) {
    case 'input-streaming':
    case 'input-available':
      return (
        <div className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
          <Spinner />
          Drafting an email…
        </div>
      )
    case 'approval-requested':
      return (
        <div className="flex flex-col gap-3 rounded-xl border p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <MailIcon className="size-4" />
            Send this email?
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">From</dt>
            <dd>{part.input.from}</dd>
            <dt className="text-muted-foreground">To</dt>
            <dd>{part.input.to}</dd>
            <dt className="text-muted-foreground">Subject</dt>
            <dd>{part.input.subject}</dd>
          </dl>
          <p className="rounded-lg bg-muted p-3 whitespace-pre-wrap">
            {part.input.body}
          </p>
          {error && <p className="text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={isPending || !threadId}
              onClick={() => React.startTransition(() => answer(true))}
            >
              Send
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending || !threadId}
              onClick={() => React.startTransition(() => answer(false))}
            >
              Don't send
            </Button>
          </div>
        </div>
      )
    case 'approval-responded':
      return (
        <div className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
          {part.approval.approved ? (
            <>
              <Spinner />
              Sending…
            </>
          ) : (
            'Not sending.'
          )}
        </div>
      )
    case 'output-available':
      return part.output.sent ? (
        <p className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
          <MailIcon className="size-4" />
          Sent "{part.output.subject}" to {part.output.to}.
        </p>
      ) : (
        <p className="px-1.5 text-sm text-destructive">
          "{part.output.subject}" wasn't sent: {part.output.error}
        </p>
      )
    case 'output-denied':
      return (
        <p className="px-1.5 text-sm text-muted-foreground">
          You chose not to send "{part.input.subject}".
        </p>
      )
    case 'output-error':
      return (
        <p className="px-1.5 text-sm text-destructive">
          The email wasn't sent: {part.errorText}
        </p>
      )
  }
}
