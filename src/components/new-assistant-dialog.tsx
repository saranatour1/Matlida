import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import type { Id } from '@convex/_generated/dataModel'
import type { BotTemplate } from '~/lib/bot-template'
import { api } from '~/lib/api'
import {
  PortraitPicker,
  portraitFromForm,
  portraitOf,
  randomPortrait,
} from '~/components/bot-avatar'
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
import { errorMessage } from '~/lib/errors'

/**
 * Makes an assistant from a look, a name and a role, then opens its chat.
 * With `template`, it starts as a copy of someone's shared assistant.
 */
export function NewAssistantDialog({
  projectId,
  template,
  onClose,
}: {
  projectId: Id<'projects'>
  template?: BotTemplate
  onClose: () => void
}) {
  const save = useMutation(api.bots.save)
  const navigate = useNavigate()
  const [portrait] = React.useState(() =>
    template ? portraitOf(template) : randomPortrait(),
  )
  const [error, submit, isPending] = React.useActionState(
    async (_previous: string | undefined, data: FormData) => {
      try {
        const id = await save({
          projectId,
          name: String(data.get('name')),
          role: String(data.get('role')),
          instructions: template?.instructions ?? '',
          portrait: portraitFromForm(data),
        })
        void navigate({
          to: '/p/$projectId',
          params: { projectId },
          search: { bot: id, panel: true },
        })
        return undefined
      } catch (e) {
        return errorMessage(e, 'Could not create it. Try again.')
      }
    },
    undefined,
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {template ? `Copy ${template.name}` : 'New assistant'}
          </DialogTitle>
          <DialogDescription>
            {template
              ? 'It comes with their instructions. Change anything you like.'
              : 'Pick a portrait and a name. You can write its instructions after.'}
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-6">
          <PortraitPicker defaultValue={portrait}>
            <Input
              name="name"
              aria-label="Name"
              placeholder="Name"
              required
              maxLength={40}
              defaultValue={template?.name}
              autoFocus
              className="text-center"
            />
            <Input
              name="role"
              aria-label="Role"
              placeholder="Role, like Researcher"
              maxLength={80}
              defaultValue={template?.role}
              className="text-center"
            />
          </PortraitPicker>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
