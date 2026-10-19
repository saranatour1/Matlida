import { useAuthActions } from '@convex-dev/auth/react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  MessagesSquareIcon,
  PlusIcon,
  SettingsIcon,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import type { Look } from '../../convex/lib/looks'
import { BotAvatar, lookOf } from '~/components/bot-avatar'
import { CommandMenu } from '~/components/command-menu'
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
      <SidebarHeader className="gap-3 pt-3">
        <div className="flex items-center justify-end gap-1">
          {project && <CommandMenu project={project} />}
          {project && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label="New assistant"
              title="New assistant"
              render={
                <Link
                  to="/p/$projectId"
                  params={{ projectId: project._id }}
                  search={{ new: true }}
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
        {project && <Assistants project={project} />}
      </SidebarContent>
      <Account />
    </Sidebar>
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
        <BotAvatar look={lookOf(project)} className="size-14 shadow-lg" />
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
                <BotAvatar look={lookOf(p)} />
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
function Assistants({ project }: { project: Doc<'projects'> }) {
  const bots = useQuery(api.api.bots.list, { projectId: project._id })
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1.5">
          <Assistant
            projectId={project._id}
            name={project.name}
            role="Lead"
            look={lookOf(project)}
          />
          {bots?.map((b) => (
            <Assistant
              key={b._id}
              projectId={project._id}
              bot={b}
              name={b.name}
              role={b.role}
              look={lookOf(b)}
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
  look,
}: {
  projectId: Id<'projects'>
  bot?: Doc<'bots'>
  name: string
  role: string
  look: Look
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
        <BotAvatar look={look} className="size-9" />
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
