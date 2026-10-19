import { useAuthActions } from '@convex-dev/auth/react'
import { Link, useSearch } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import {
  FolderIcon,
  LogOutIcon,
  MessageSquareIcon,
  PlusIcon,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '~/components/ui/sidebar'
import { useProject } from '~/hooks/use-project'

export function AppSidebar() {
  const projects = useQuery(api.api.projects.list)
  const project = useProject()
  const { setOpenMobile } = useSidebar()

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupAction
            render={<Link to="/" />}
            aria-label="New project"
            title="New project"
          >
            <PlusIcon />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects?.length === 0 && (
                <li className="px-2 text-xs text-muted-foreground">
                  No projects yet.
                </li>
              )}
              {projects?.map((p) => (
                <SidebarMenuItem key={p._id}>
                  <SidebarMenuButton
                    isActive={project?._id === p._id}
                    render={
                      <Link to="/p/$projectId" params={{ projectId: p._id }} />
                    }
                    onClick={() => setOpenMobile(false)}
                  >
                    <FolderIcon />
                    <span className="truncate">{p.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {project && <Chats projectId={project._id} />}
      </SidebarContent>
      <Account />
    </Sidebar>
  )
}

function Chats({ projectId }: { projectId: Id<'projects'> }) {
  const chats = useQuery(api.api.threads.list, { projectId, kind: 'chat' })
  const { thread } = useSearch({ strict: false })
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Chats</SidebarGroupLabel>
      <SidebarGroupAction
        render={<Link to="/p/$projectId" params={{ projectId }} />}
        aria-label="New chat"
        title="New chat"
      >
        <PlusIcon />
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {chats?.length === 0 && (
            <li className="px-2 text-xs text-muted-foreground">
              No chats yet.
            </li>
          )}
          {chats?.map((c) => (
            <SidebarMenuItem key={c._id}>
              <SidebarMenuButton
                isActive={thread === c.threadId}
                render={
                  <Link
                    to="/p/$projectId"
                    params={{ projectId }}
                    search={{ thread: c.threadId }}
                  />
                }
                onClick={() => setOpenMobile(false)}
              >
                <MessageSquareIcon />
                <span className="truncate">{c.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
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
