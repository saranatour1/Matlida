import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import {
  BotIcon,
  LibraryIcon,
  PlugIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SmartphoneIcon,
  UsersIcon,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { BotAvatar, portraitOf } from '~/components/bot-avatar'
import { Button } from '~/components/ui/button'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command'
import { useSidebar } from '~/components/ui/sidebar'
import { errorMessage } from '~/lib/errors'

/**
 * Search for assistants and actions. "New group chat" switches to picking
 * the bots that join, then starts a chat where the lead works with them.
 */
export function CommandMenu({ project }: { project: Doc<'projects'> }) {
  const projectId = project._id
  const [open, setOpen] = React.useState(false)
  const [picking, setPicking] = React.useState(false)
  const [picked, setPicked] = React.useState<Array<Id<'bots'>>>([])
  const [error, setError] = React.useState<string>()
  const bots = useQuery(api.api.bots.list, { projectId })
  const startGroup = useMutation(api.api.threads.startGroup)
  const navigate = useNavigate()
  const { setOpenMobile } = useSidebar()

  const close = () => {
    setOpen(false)
    setPicking(false)
    setPicked([])
    setError(undefined)
    setOpenMobile(false)
  }
  const go = (run: () => Promise<void>) => {
    close()
    void run()
  }
  const toggle = (id: Id<'bots'>) =>
    setPicked((ids) =>
      ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id],
    )
  const start = async () => {
    try {
      const thread = await startGroup({ projectId, memberIds: picked })
      close()
      await navigate({
        to: '/p/$projectId',
        params: { projectId },
        search: { thread },
      })
    } catch (e) {
      setError(errorMessage(e, 'Could not start the group. Try again.'))
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full"
        aria-label="Search"
        title="Search"
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title="Search"
        description="Find an assistant or an action"
      >
        <Command>
          <CommandInput
            placeholder={
              picking ? 'Who joins the group?' : 'Search assistants and actions'
            }
          />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {picking ? (
              <>
                <CommandGroup heading={`Group with ${project.name}`}>
                  {bots?.length === 0 && (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                      Add an assistant first.
                    </p>
                  )}
                  {bots?.map((b) => (
                    <CommandItem
                      key={b._id}
                      value={`${b.name} ${b.role}`}
                      data-checked={picked.includes(b._id)}
                      onSelect={() => toggle(b._id)}
                    >
                      <BotAvatar portrait={portraitOf(b)} className="size-5" />
                      {b.name}
                      <span className="truncate text-muted-foreground">
                        {b.role}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup forceMount>
                  <CommandItem
                    value="start group chat"
                    forceMount
                    disabled={picked.length === 0}
                    onSelect={() => void start()}
                  >
                    <UsersIcon />
                    {picked.length
                      ? `Start a group chat with ${picked.length}`
                      : 'Pick at least one'}
                  </CommandItem>
                  {error && (
                    <p className="px-2 py-1 text-xs text-destructive">
                      {error}
                    </p>
                  )}
                </CommandGroup>
              </>
            ) : (
              <>
                <CommandGroup heading="Actions">
                  <CommandItem
                    value="new assistant bot"
                    onSelect={() =>
                      go(() =>
                        navigate({
                          to: '/p/$projectId',
                          params: { projectId },
                          search: { new: true },
                        }),
                      )
                    }
                  >
                    <PlusIcon />
                    New assistant
                  </CommandItem>
                  <CommandItem
                    value="new group chat"
                    onSelect={() => setPicking(true)}
                  >
                    <UsersIcon />
                    New group chat
                  </CommandItem>
                </CommandGroup>
                <CommandGroup heading="Assistants">
                  {[
                    { ...project, role: 'Lead', _id: undefined },
                    ...(bots ?? []),
                  ].map((a) => (
                    <CommandItem
                      key={a._id ?? 'lead'}
                      value={`${a.name} ${a.role}`}
                      onSelect={() =>
                        go(() =>
                          navigate({
                            to: '/p/$projectId',
                            params: { projectId },
                            search: { bot: a._id },
                          }),
                        )
                      }
                    >
                      <BotAvatar portrait={portraitOf(a)} className="size-5" />
                      {a.name}
                      <span className="truncate text-muted-foreground">
                        {a.role}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading="Workspace">
                  {(
                    [
                      ['Library', '/p/$projectId/library', LibraryIcon],
                      ['Assistants', '/p/$projectId/bots', BotIcon],
                      ['Messaging', '/p/$projectId/messaging', SmartphoneIcon],
                      ['Connections', '/p/$projectId/connections', PlugIcon],
                      ['Settings', '/p/$projectId/settings', SettingsIcon],
                    ] as const
                  ).map(([label, to, Icon]) => (
                    <CommandItem
                      key={to}
                      value={label}
                      onSelect={() =>
                        go(() => navigate({ to, params: { projectId } }))
                      }
                    >
                      <Icon />
                      {label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
