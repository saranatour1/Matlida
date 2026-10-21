import * as React from 'react'
import { useAction } from 'convex/react'
import { ReplyIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Textarea } from '~/components/ui/textarea'
import { errorMessage } from '~/lib/errors'

type Email = FunctionReturnType<typeof api.api.emails.forThread>[number]

/** Reply under an email in the chat: starts from the assistant's draft, sent once you press Send. */
export function EmailReply({
  email,
  className,
}: {
  email: Email
  className?: string
}) {
  const reply = useAction(api.api.emails.reply)
  const [open, setOpen] = React.useState(false)
  const [error, send, isSending] = React.useActionState(
    async (_previous: string | undefined, data: FormData) => {
      try {
        await reply({ emailId: email._id, text: String(data.get('text')) })
        setOpen(false)
        return undefined
      } catch (e) {
        return errorMessage(e, 'Could not send it. Try again.')
      }
    },
    undefined,
  )

  return (
    <div className={`flex ${className ?? ''}`}>
      {email.repliedAt ? (
        <span className="px-1 text-xs text-muted-foreground">Replied</span>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <ReplyIcon />
          Reply
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Reply to {email.from}</DialogTitle>
            <DialogDescription>
              Re: {email.subject || '(no subject)'}.{' '}
              {email.draft
                ? 'Here’s a draft. Change anything, then send.'
                : 'Write your reply, then send.'}
            </DialogDescription>
          </DialogHeader>
          <form action={send} className="flex flex-col gap-4">
            <Textarea
              name="text"
              aria-label="Reply"
              required
              rows={12}
              maxLength={20_000}
              defaultValue={email.draft}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSending}>
                {isSending ? 'Sending…' : 'Send'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
