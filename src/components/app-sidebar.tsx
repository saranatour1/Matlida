import * as React from 'react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import {
  BotIcon,
  CrownIcon,
  FileTextIcon,
  FolderIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  LogOutIcon,
  PlusIcon,
  SettingsIcon,
  UserIcon,
  type LucideIcon,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { useProject } from '~/hooks/use-project'
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

type Item = {
  key: string
  icon: LucideIcon
  title: React.ReactNode
  link: React.ReactElement
  active?: boolean
}

export function AppSidebar() {
  const projects = useQuery(api.projects.list)
  const project = useProject()

  return (
    <Sidebar>
      <SidebarContent>
        <Section
          label="Projects"
          empty="No projects yet."
          action={<NewLink label="New project" link={<Link to="/" />} />}
          items={projects?.map((p) => ({
            key: p._id,
            icon: FolderIcon,
            title: p.name,
            link: <Link to="/p/$projectId" params={{ projectId: p._id }} />,
            active: project?._id === p._id,
          }))}
        />
        {project && <ProjectSections project={project} />}
      </SidebarContent>
      <Account />
    </Sidebar>
  )
}

function ProjectSections({ project }: { project: Doc<'projects'> }) {
  const projectId = project._id
  const team = useQuery(api.employees.list, { projectId })
  const chats = useQuery(api.threads.list, { projectId, kind: 'chat' })
  const threads = useQuery(api.threads.list, { projectId, kind: 'employee' })
  const artifacts = useQuery(api.artifacts.list, { projectId })
  const params = useParams({ strict: false })
  const search = useSearch({ strict: false })

  return (
    <>
      <Section
        label="Bots"
        empty="No employees yet."
        action={
          <NewLink
            label="Add employee"
            link={<Link to="/p/$projectId/team" params={{ projectId }} />}
          />
        }
        items={
          team && [
            {
              key: 'lead',
              icon: CrownIcon,
              title: <Named name={project.name} role="Lead" />,
              link: <Link to="/" search={{ edit: projectId }} />,
            },
            ...team.map((e) => ({
              key: e._id,
              icon: BotIcon,
              title: <Named name={e.name} role={e.role} />,
              link: (
                <Link
                  to="/p/$projectId/team"
                  params={{ projectId }}
                  search={{ edit: e._id }}
                />
              ),
              active: search.edit === e._id,
            })),
          ]
        }
      />
      <Section
        label="Chats"
        empty="No chats yet."
        action={
          <NewLink
            label="New chat"
            link={<Link to="/p/$projectId" params={{ projectId }} />}
          />
        }
        items={chats?.map((c) => ({
          key: c._id,
          icon: MessageSquareIcon,
          title: c.title,
          link: (
            <Link
              to="/p/$projectId"
              params={{ projectId }}
              search={{ thread: c.threadId }}
            />
          ),
          active: search.thread === c.threadId,
        }))}
      />
      <Section
        label="Threads"
        empty={`${project.name}'s talks with employees show up here.`}
        items={threads?.map((t) => ({
          key: t._id,
          icon: MessagesSquareIcon,
          title: t.title,
          link: (
            <Link
              to="/p/$projectId/threads/$threadId"
              params={{ projectId, threadId: t.threadId }}
            />
          ),
          active: params.threadId === t.threadId,
        }))}
      />
      <Section
        label="Artifacts"
        empty={`Documents ${project.name} saves show up here.`}
        items={artifacts?.map((a) => ({
          key: a._id,
          icon: FileTextIcon,
          title: a.title,
          link: (
            <Link
              to="/p/$projectId/artifacts/$artifactId"
              params={{ projectId, artifactId: a._id }}
            />
          ),
          active: params.artifactId === a._id,
        }))}
      />
    </>
  )
}

function Account() {
  const user = useQuery(api.users.current)
  const { signOut } = useAuthActions()
  return (
    <SidebarFooter>
      <div className="flex items-center gap-2 px-2 text-sm">
        <UserIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{user?.username}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Settings"
          title="Settings"
          render={<Link to="/settings" />}
          nativeButton={false}
        >
          <SettingsIcon />
        </Button>
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

function Section({
  label,
  items,
  empty,
  action,
}: {
  label: string
  items: Item[] | undefined
  empty: string
  action?: React.ReactNode
}) {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      {action}
      <SidebarGroupContent>
        <SidebarMenu>
          {items?.length === 0 && (
            <li className="px-2 text-xs text-muted-foreground">{empty}</li>
          )}
          {items?.map((item) => (
            <SidebarMenuItem key={item.key}>
              <SidebarMenuButton
                isActive={item.active}
                render={item.link}
                onClick={() => setOpenMobile(false)}
              >
                <item.icon />
                <span className="truncate">{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function Named({ name, role }: { name: string; role: string }) {
  return (
    <>
      {name} <span className="text-muted-foreground">· {role}</span>
    </>
  )
}

function NewLink({ label, link }: { label: string; link: React.ReactElement }) {
  return (
    <SidebarGroupAction render={link} aria-label={label} title={label}>
      <PlusIcon />
    </SidebarGroupAction>
  )
}
