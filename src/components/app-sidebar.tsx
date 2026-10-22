import { useAuthActions } from '@convex-dev/auth/react'
import { Link, useSearch } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import {
  ChevronDownIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  PlusIcon,
  SettingsIcon,
} from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import type { Portrait } from '@convex/lib/portraits'
import { BotAvatar, portraitOf } from '~/components/bot-avatar'
import { CommandMenu } from '~/components/command-menu'
import {
  AvatarFallback,
  AvatarImage,
  Avatar as AvatarRoot,
} from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
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
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '~/components/ui/sidebar'
import { useProject } from '~/hooks/use-project'
import { attempt } from '~/lib/attempt'
import { forgetUser } from '~/lib/analytics'

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
        aria-label={`Chat with ${project.name}`}
        title={`Chat with ${project.name}`}
      >
        <BotAvatar
          portrait={portraitOf(project)}
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
                <BotAvatar portrait={portraitOf(p)} />
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link to="/projects" search={{ create: true }} />}>
            <PlusIcon />
            New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** The lead first, then the bots, as cards. Each one opens to its one chat. */
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
            portrait={portraitOf(project)}
          />
          {bots?.map((b) => (
            <Assistant
              key={b._id}
              projectId={project._id}
              bot={b}
              name={b.name}
              role={b.role}
              portrait={portraitOf(b)}
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
  portrait,
}: {
  projectId: Id<'projects'>
  bot?: Doc<'bots'>
  name: string
  role: string
  portrait: Portrait
}) {
  const search = useSearch({ strict: false })
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        size="lg"
        isActive={search.bot === bot?._id}
        className="h-auto rounded-xl py-2 data-[active=true]:bg-sidebar-accent"
        render={
          <Link
            to="/p/$projectId"
            params={{ projectId }}
            search={{ bot: bot?._id }}
          />
        }
        onClick={() => setOpenMobile(false)}
        title={`Chat with ${name}`}
      >
        <BotAvatar portrait={portrait} className="size-9" />
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
            Message {name}
          </span>
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
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
              <DropdownMenuItem
                onClick={() => {
                  forgetUser()
                  void attempt(signOut())
                }}
              >
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
