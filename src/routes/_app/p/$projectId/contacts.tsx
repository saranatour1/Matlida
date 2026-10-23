import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { MailIcon, PencilIcon, PhoneIcon, Trash2Icon } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { maskNumber } from '@convex/lib/phone'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { SidebarTrigger } from '~/components/ui/sidebar'
import { useProject } from '~/hooks/use-project'
import { attempt } from '~/lib/attempt'
import { errorMessage } from '~/lib/errors'

export const Route = createFileRoute('/_app/p/$projectId/contacts')({
  component: Contacts,
})

/**
 * The people the assistants can reach for you. Email and Call open the lead's
 * chat with the message started, so you say what to tell them and send it.
 */
function Contacts() {
  const project = useProject()
  const contacts = useQuery(
    api.api.contacts.list,
    project ? { projectId: project._id } : 'skip',
  )
  const remove = useMutation(api.api.contacts.remove)
  const [editing, setEditing] = React.useState<Id<'contacts'>>()
  if (!project) {
    return project === null ? (
      <p className="p-6 text-sm text-muted-foreground">Project not found.</p>
    ) : null
  }
  const reach = (draft: string) => ({
    to: '/p/$projectId' as const,
    params: { projectId: project._id },
    search: { draft },
  })
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex items-center gap-2 px-4 py-3">
        <SidebarTrigger />
        <h1 className="text-sm font-medium">Contacts</h1>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pb-6">
        <p className="text-sm text-muted-foreground">
          People {project.name} can email or phone for you. Assistants also add
          people here when you give them someone&apos;s details in a chat.
        </p>
        <ContactForm projectId={project._id} />
        {contacts === undefined ? null : contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Note</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) =>
                  editing === contact._id ? (
                    <tr key={contact._id} className="border-t">
                      <td colSpan={5} className="p-3">
                        <ContactForm
                          projectId={project._id}
                          contact={contact}
                          onDone={() => setEditing(undefined)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={contact._id} className="border-t align-top">
                      <td className="px-3 py-2 font-medium">{contact.name}</td>
                      <td className="px-3 py-2">{contact.email ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {contact.phone ? maskNumber(contact.phone) : '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {contact.note ?? ''}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          {contact.email && (
                            <Button
                              size="sm"
                              variant="outline"
                              render={
                                <Link
                                  {...reach(
                                    `Email ${contact.name} at ${contact.email}: `,
                                  )}
                                />
                              }
                              nativeButton={false}
                            >
                              <MailIcon />
                              Email
                            </Button>
                          )}
                          {contact.phone && (
                            <Button
                              size="sm"
                              variant="outline"
                              render={
                                <Link
                                  {...reach(
                                    `Call ${contact.name} at ${contact.phone} and `,
                                  )}
                                />
                              }
                              nativeButton={false}
                            >
                              <PhoneIcon />
                              Call
                            </Button>
                          )}
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Edit ${contact.name}`}
                            onClick={() => setEditing(contact._id)}
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Delete ${contact.name}`}
                            onClick={() => {
                              if (!confirm(`Delete ${contact.name}?`)) return
                              void attempt(remove({ id: contact._id }))
                            }}
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/** Adds a contact, or edits `contact`. Blank fields are left out. */
function ContactForm({
  projectId,
  contact,
  onDone,
}: {
  projectId: Id<'projects'>
  contact?: Doc<'contacts'>
  onDone?: () => void
}) {
  const put = useMutation(api.api.contacts.put)
  const [error, save, saving] = React.useActionState(
    async (_previous: string | undefined, form: FormData) => {
      const field = (name: string) =>
        String(form.get(name) ?? '').trim() || undefined
      try {
        await put({
          projectId,
          id: contact?._id,
          name: field('name') ?? '',
          email: field('email'),
          phone: field('phone')?.replace(/[\s()-]/g, ''),
          note: field('note'),
        })
        onDone?.()
        return undefined
      } catch (e) {
        return errorMessage(e, "Couldn't save the contact. Try again.")
      }
    },
    undefined,
  )
  return (
    <form action={save} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          name="name"
          required
          placeholder="Name"
          defaultValue={contact?.name}
          aria-label="Name"
        />
        <Input
          name="email"
          type="email"
          placeholder="Email"
          defaultValue={contact?.email}
          aria-label="Email"
        />
        <Input
          name="phone"
          type="tel"
          placeholder="Phone, like +14155550123"
          defaultValue={contact?.phone}
          aria-label="Phone"
        />
        <Input
          name="note"
          placeholder="Note, like “my brother”"
          defaultValue={contact?.note}
          aria-label="Note"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {contact ? 'Save' : 'Add contact'}
        </Button>
        {onDone && (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  )
}
