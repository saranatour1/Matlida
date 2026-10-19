import { useAuthActions } from '@convex-dev/auth/react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import {
  ChevronRightIcon,
  ChevronsUpDownIcon,
  LibraryIcon,
  LogOutIcon,
  MessagesSquareIcon,
  PlusIcon,
  SettingsIcon,
  SmartphoneIcon,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import type * as React from 'react'
import { Orb, defaultAvatar } from '~/components/orb'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
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
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
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
  return (
    <Sidebar>
      <SidebarHeader>
        <WorkspaceSwitcher project={project ?? undefined} />
      </SidebarHeader>
      <SidebarContent>
        {project && <Assistants project={project} />}
        {project && <Workspace project={project} />}
      </SidebarContent>
      <Account />
    </Sidebar>
  )
}

function WorkspaceSwitcher({ project }: { project?: Doc<'projects'> }) {
  const projects = useQuery(api.api.projects.list)
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" />}
            aria-label="Switch workspace"
          >
            <img src="/logo.svg" alt="" className="size-8" />
            <span className="flex-1 truncate font-medium">
              {project?.name ?? 'Workspaces'}
            </span>
            <ChevronsUpDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {projects?.map((p) => (
              <DropdownMenuItem
                key={p._id}
                render={
                  <Link to="/p/$projectId" params={{ projectId: p._id }} />
                }
              >
                {p.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={<Link to="/" search={{ create: true }} />}
            >
              <PlusIcon />
              New workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** The lead first, then the bots. Each one opens to its recent chats. */
function Assistants({ project }: { project: Doc<'projects'> }) {
  const bots = useQuery(api.api.bots.list, { projectId: project._id })
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Assistants</SidebarGroupLabel>
      <SidebarGroupAction
        render={
          <Link to="/p/$projectId/bots" params={{ projectId: project._id }} />
        }
        aria-label="New assistant"
        title="New assistant"
      >
        <PlusIcon />
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          <Assistant
            projectId={project._id}
            name={project.name}
            role="Lead"
            icon={
              <Orb avatar={project.avatar ?? defaultAvatar(project.name)} />
            }
          />
          {bots?.map((b) => (
            <Assistant
              key={b._id}
              projectId={project._id}
              bot={b}
              name={b.name}
              role={b.role}
              icon={<Orb avatar={b.avatar ?? defaultAvatar(b.name)} />}
            />
          ))}
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
  icon,
}: {
  projectId: Id<'projects'>
  bot?: Doc<'bots'>
  name: string
  role: string
  icon: React.ReactNode
}) {
  const search = useSearch({ strict: false })
  const { threadId } = useParams({ strict: false })
  const { setOpenMobile } = useSidebar()
  const threads = useQuery(api.api.threads.listForBot, {
    projectId,
    botId: bot?._id,
  })
  const isActive = search.bot === bot?._id && !threadId
  return (
    <Collapsible
      key={String(isActive)}
      defaultOpen={isActive}
      render={<SidebarMenuItem />}
      className="group/collapsible"
    >
      <SidebarMenuButton
        isActive={isActive && !search.thread}
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
        {icon}
        <span className="truncate">
          {name} <span className="text-muted-foreground">· {role}</span>
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

function Workspace({ project }: { project: Doc<'projects'> }) {
  const projectId = project._id
  const { setOpenMobile } = useSidebar()
  const close = () => setOpenMobile(false)
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workspace</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <Link to="/p/$projectId/library" params={{ projectId }} />
              }
              onClick={close}
            >
              <LibraryIcon />
              <span>Library</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <Link to="/p/$projectId/texting" params={{ projectId }} />
              }
              onClick={close}
            >
              <SmartphoneIcon />
              <span className="truncate">Text {project.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <Link to="/p/$projectId/settings" params={{ projectId }} />
              }
              onClick={close}
            >
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function Account() {
  const user = useQuery(api.api.users.current)
  const { signOut } = useAuthActions()
  const name = user?.name ?? user?.email
  return (
    <SidebarFooter>
      <div className="flex items-center gap-2 px-2 text-sm">
        <Avatar className="size-6">
          <AvatarImage src={user?.image} alt="" referrerPolicy="no-referrer" />
          <AvatarFallback>{name?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="flex-1 truncate">{name}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Sign out"
          title="Sign out"
          onClick={() => void signOut()}
        >
          <LogOutIcon />
        </Button>
      </div>
    </SidebarFooter>
  )
}
