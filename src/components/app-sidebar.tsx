import { useAuthActions } from '@convex-dev/auth/react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import * as React from 'react'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  MessagesSquareIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import type { Avatar } from '../../convex/lib/avatars'
import { Orb, defaultAvatar } from '~/components/orb'
import {
  AvatarFallback,
  AvatarImage,
  Avatar as AvatarRoot,
} from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '~/components/ui/sidebar'
import { useProject } from '~/hooks/use-project'

export function AppSidebar() {
  const project = useProject()
  const [filter, setFilter] = React.useState('')
  return (
    <Sidebar>
      <SidebarHeader className="gap-3 pt-3">
        <div className="flex items-center justify-end gap-1">
          <SearchField value={filter} onChange={setFilter} />
          {project && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label="New assistant"
              title="New assistant"
              render={
                <Link
                  to="/p/$projectId/bots"
                  params={{ projectId: project._id }}
                />
              }
              nativeButton={false}
            >
              <PlusIcon />
            </Button>
          )}
        </div>
        {project && <Hero project={project} />}
      </SidebarHeader>
      <SidebarContent>
        {project && <Assistants project={project} filter={filter} />}
      </SidebarContent>
      <Account />
    </Sidebar>
  )
}

/** A search box that opens from an icon and filters the assistants. */
function SearchField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  if (!open && !value) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full"
        aria-label="Search assistants"
        title="Search assistants"
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
      </Button>
    )
  }
  return (
    <SidebarInput
      autoFocus
      value={value}
      placeholder="Search assistants"
      aria-label="Search assistants"
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => !value && setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onChange('')
          setOpen(false)
        }
      }}
    />
  )
}

/** The lead, big, with the workspace switcher under its name. */
function Hero({ project }: { project: Doc<'projects'> }) {
  const projects = useQuery(api.api.projects.list)
  const { setOpenMobile } = useSidebar()
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <Link
        to="/p/$projectId"
        params={{ projectId: project._id }}
        search={{}}
        onClick={() => setOpenMobile(false)}
        aria-label={`New chat with ${project.name}`}
        title={`New chat with ${project.name}`}
      >
        <Orb
          avatar={project.avatar ?? defaultAvatar(project.name)}
          className="size-14 shadow-lg"
        />
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" className="h-7 gap-1" />}
          aria-label="Switch workspace"
        >
          <span className="truncate font-medium">{project.name}</span>
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {projects?.map((p) => (
              <DropdownMenuItem
                key={p._id}
                render={
                  <Link to="/p/$projectId" params={{ projectId: p._id }} />
                }
              >
                <Orb avatar={p.avatar ?? defaultAvatar(p.name)} />
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link to="/" search={{ create: true }} />}>
            <PlusIcon />
            New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** The lead first, then the bots, as cards. Each one opens to its recent chats. */
function Assistants({
  project,
  filter,
}: {
  project: Doc<'projects'>
  filter: string
}) {
  const bots = useQuery(api.api.bots.list, { projectId: project._id })
  const q = filter.trim().toLowerCase()
  const matches = (name: string, role: string) =>
    !q || `${name} ${role}`.toLowerCase().includes(q)
  const shown = (bots ?? []).filter((b) => matches(b.name, b.role))
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1.5">
          {matches(project.name, 'Lead') && (
            <Assistant
              projectId={project._id}
              name={project.name}
              role="Lead"
              avatar={project.avatar ?? defaultAvatar(project.name)}
            />
          )}
          {shown.map((b) => (
            <Assistant
              key={b._id}
              projectId={project._id}
              bot={b}
              name={b.name}
              role={b.role}
              avatar={b.avatar ?? defaultAvatar(b.name)}
            />
          ))}
          {bots &&
            q &&
            shown.length === 0 &&
            !matches(project.name, 'Lead') && (
              <li className="px-2 text-xs text-muted-foreground">
                No assistant matches.
              </li>
            )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function Assistant({
  projectId,
  bot,
  name,
  role,
  avatar,
}: {
  projectId: Id<'projects'>
  bot?: Doc<'bots'>
  name: string
  role: string
  avatar: Avatar
}) {
  const search = useSearch({ strict: false })
  const { threadId } = useParams({ strict: false })
  const { setOpenMobile } = useSidebar()
  const threads = useQuery(api.api.threads.listForBot, {
    projectId,
    botId: bot?._id,
  })
  const isActive =
    search.bot === bot?._id &&
    (!threadId || threads?.some((t) => t.threadId === threadId))
  const latest = threads?.[0]
  return (
    <Collapsible
      key={String(isActive)}
      defaultOpen={isActive}
      render={<SidebarMenuItem />}
      className="group/collapsible"
    >
      <SidebarMenuButton
        size="lg"
        isActive={isActive}
        className="h-auto rounded-xl py-2 data-[active=true]:bg-sidebar-accent"
        render={
          <Link
            to="/p/$projectId"
            params={{ projectId }}
            search={{ bot: bot?._id }}
          />
        }
        onClick={() => setOpenMobile(false)}
        title={`New chat with ${name}`}
      >
        <Orb avatar={avatar} className="size-9" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium">{name}</span>
            <Badge
              variant="secondary"
              className="h-4 max-w-24 shrink truncate px-1.5 text-[10px] font-normal"
            >
              {role}
            </Badge>
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {latest?.title ?? `Message ${name}`}
          </span>
        </span>
      </SidebarMenuButton>
      {threads && threads.length > 0 && (
        <>
          <CollapsibleTrigger
            render={<SidebarMenuAction />}
            aria-label={`${name}'s chats`}
            className="transition-transform group-data-[open]/collapsible:rotate-90"
          >
            <ChevronRightIcon />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {threads.map((t) => (
                <SidebarMenuSubItem key={t._id}>
                  <SidebarMenuSubButton
                    isActive={
                      search.thread === t.threadId || threadId === t.threadId
                    }
                    render={
                      t.kind === 'chat' ? (
                        <Link
                          to="/p/$projectId"
                          params={{ projectId }}
                          search={{ bot: bot?._id, thread: t.threadId }}
                        />
                      ) : (
                        <Link
                          to="/p/$projectId/threads/$threadId"
                          params={{ projectId, threadId: t.threadId }}
                        />
                      )
                    }
                    onClick={() => setOpenMobile(false)}
                  >
                    {t.kind === 'subagent' && <MessagesSquareIcon />}
                    <span className="truncate">{t.title}</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </>
      )}
    </Collapsible>
  )
}

/** You, at the bottom. Opens to your settings and sign out. */
function Account() {
  const user = useQuery(api.api.users.current)
  const project = useProject()
  const { signOut } = useAuthActions()
  const name = user?.name ?? user?.email
  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<SidebarMenuButton size="lg" />}
              aria-label="Account"
            >
              <AvatarRoot className="size-6">
                <AvatarImage
                  src={user?.image}
                  alt=""
                  referrerPolicy="no-referrer"
                />
                <AvatarFallback>{name?.[0]?.toUpperCase()}</AvatarFallback>
              </AvatarRoot>
              <span className="flex-1 truncate">{name}</span>
              <ChevronsUpDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="truncate font-normal">
                  {user?.email ?? name}
                </DropdownMenuLabel>
                {project && (
                  <DropdownMenuItem
                    render={
                      <Link
                        to="/p/$projectId/settings"
                        params={{ projectId: project._id }}
                        hash="account"
                      />
                    }
                  >
                    <SettingsIcon />
                    Settings
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()}>
                <LogOutIcon />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  )
}
