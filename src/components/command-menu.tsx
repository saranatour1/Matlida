import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import {
  BotIcon,
  LibraryIcon,
  PlugIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SmartphoneIcon,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
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

/** Search for assistants and actions. */
export function CommandMenu({ project }: { project: Doc<'projects'> }) {
  const projectId = project._id
  const [open, setOpen] = React.useState(false)
  const bots = useQuery(api.api.bots.list, { projectId })
  const navigate = useNavigate()
  const { setOpenMobile } = useSidebar()

  const close = () => {
    setOpen(false)
    setOpenMobile(false)
  }
  const go = (run: () => Promise<void>) => {
    close()
    void run()
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
          <CommandInput placeholder="Search assistants and actions" />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
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
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
