import * as React from 'react'
import { useAction } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { errorMessage } from '~/lib/errors'

type Draft = { name: string; description: string; markdown: string }

/**
 * Writes a command with AI from what the user wants it to do, then shows it
 * to check and edit before it's saved to the Library.
 */
export function CommandDialog({
  projectId,
  onClose,
}: {
  projectId: Id<'projects'>
  onClose: () => void
}) {
  const draft = useAction(api.api.commands.draft)
  const save = useAction(api.api.commands.save)
  const [written, setWritten] = React.useState<Draft>()

  const [draftError, write, isWriting] = React.useActionState(
    async (_previous: string | undefined, data: FormData) => {
      try {
        setWritten(
          await draft({ projectId, idea: String(data.get('idea') ?? '') }),
        )
        return undefined
      } catch (e) {
        return errorMessage(e, 'Could not write it. Try again.')
      }
    },
    undefined,
  )

  const [saveError, submit, isSaving] = React.useActionState(
    async (_previous: string | undefined, data: FormData) => {
      try {
        await save({
          projectId,
          name: String(data.get('name')),
          description: String(data.get('description')),
          markdown: String(data.get('markdown')),
        })
        onClose()
        return undefined
      } catch (e) {
        return errorMessage(e, 'Could not save it. Try again.')
      }
    },
    undefined,
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create a command with AI</DialogTitle>
          <DialogDescription>
            {written
              ? 'Check it, change anything, then save. Run it from + or by typing /name.'
              : 'Say what it should do. Matilda writes the command, and you check it before it’s saved.'}
          </DialogDescription>
        </DialogHeader>
        {!written ? (
          <form action={write} className="flex flex-col gap-4">
            <Textarea
              name="idea"
              aria-label="What should it do?"
              placeholder="Every Friday-style weekly update: what we shipped, what's next, risks, as a short post for the team."
              required
              maxLength={2000}
              rows={4}
              autoFocus
            />
            {draftError && (
              <p className="text-sm text-destructive">{draftError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isWriting}>
                {isWriting ? 'Writing…' : 'Write it'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form action={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              Name
              <Input
                name="name"
                required
                maxLength={32}
                defaultValue={written.name}
                className="font-mono"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              What it does
              <Input
                name="description"
                required
                maxLength={200}
                defaultValue={written.description}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              Instructions
              <Textarea
                name="markdown"
                required
                rows={12}
                defaultValue={written.markdown}
                className="font-mono text-xs"
              />
            </label>
            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setWritten(undefined)}
              >
                Start over
              </Button>
              <Button type="submit" disabled={isSaving}>
                Save command
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
