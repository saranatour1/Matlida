import * as React from 'react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import {
  BotIcon,
  CrownIcon,
  FileTextIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  PlusIcon,
  type LucideIcon,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import {
  Sidebar,
  SidebarContent,
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
  const team = useQuery(api.employees.list)
  const chats = useQuery(api.threads.list, { kind: 'chat' })
  const threads = useQuery(api.threads.list, { kind: 'employee' })
  const artifacts = useQuery(api.artifacts.list)
  const params = useParams({ strict: false })
  const search = useSearch({ strict: false })

  return (
    <Sidebar>
      <SidebarContent>
        <Section
          label="Bots"
          empty="No employees yet."
          action={<NewLink to="/team" label="Add employee" />}
          items={
            team && [
              {
                key: 'matilda',
                icon: CrownIcon,
                title: <Named name="Matilda" role="Boss" />,
                link: <Link to="/" />,
              },
              ...team.map((e) => ({
                key: e._id,
                icon: BotIcon,
                title: <Named name={e.name} role={e.role} />,
                link: <Link to="/team" search={{ edit: e._id }} />,
                active: search.edit === e._id,
              })),
            ]
          }
        />
        <Section
          label="Chats"
          empty="No chats yet."
          action={<NewLink to="/" label="New chat" />}
          items={chats?.map((c) => ({
            key: c._id,
            icon: MessageSquareIcon,
            title: c.title,
            link: <Link to="/" search={{ thread: c.threadId }} />,
            active: search.thread === c.threadId,
          }))}
        />
        <Section
          label="Threads"
          empty="Matilda's talks with employees show up here."
          items={threads?.map((t) => ({
            key: t._id,
            icon: MessagesSquareIcon,
            title: t.title,
            link: (
              <Link to="/threads/$threadId" params={{ threadId: t.threadId }} />
            ),
            active: params.threadId === t.threadId,
          }))}
        />
        <Section
          label="Artifacts"
          empty="Documents Matilda saves show up here."
          items={artifacts?.map((a) => ({
            key: a._id,
            icon: FileTextIcon,
            title: a.title,
            link: (
              <Link
                to="/artifacts/$artifactId"
                params={{ artifactId: a._id }}
              />
            ),
            active: params.artifactId === a._id,
          }))}
        />
      </SidebarContent>
    </Sidebar>
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

function NewLink({ to, label }: { to: '/' | '/team'; label: string }) {
  return (
    <SidebarGroupAction
      render={<Link to={to} />}
      aria-label={label}
      title={label}
    >
      <PlusIcon />
    </SidebarGroupAction>
  )
}
