import * as React from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import {
  AlarmClockIcon,
  CopyIcon,
  CpuIcon,
  GlobeIcon,
  ImageIcon,
  LinkIcon,
  ListChecksIcon,
  MessageSquareIcon,
  MicIcon,
  ShareIcon,
  TelescopeIcon,
  XIcon,
} from 'lucide-react'
import { api } from '@convex/_generated/api'
import { CHANNELS } from '@convex/lib/channels'
import { MODELS, modelName } from '@convex/lib/models'
import type { Doc } from '@convex/_generated/dataModel'
import { encodeTemplate } from '~/lib/bot-template'
import { errorMessage } from '~/lib/errors'
import { BotAvatar, portraitOf } from '~/components/bot-avatar'
import { Button } from '~/components/ui/button'
import { reminderWhen } from '~/lib/reminders'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { CallHistory } from '~/components/call-history'
import { TASK_STATUS } from '~/components/task-card'
import { attempt } from '~/lib/attempt'

/**
 * Convex bills action time by memory used: 64 MB actions at $0.30 per GB-hour
 * on the Pro plan. An estimate, since included usage isn't counted.
 */
const CONVEX_DOLLARS_PER_MS = (0.0625 * 0.3) / 3_600_000

const usd = (n: number) =>
  n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`

const KIND_ICON = {
  reply: MessageSquareIcon,
  search: GlobeIcon,
  research: TelescopeIcon,
  compute: CpuIcon,
  voice: MicIcon,
  media: ImageIcon,
} as const

/** The right sidebar for a chat: who you're talking to, with Details, Library and Costs tabs. */
export function AssistantPanel({
  project,
  bot,
  threadId,
}: {
  project: Doc<'projects'>
  bot?: Doc<'bots'>
  threadId?: string
}) {
  const name = bot?.name ?? project.name

  return (
    <aside className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-background text-sm md:relative md:z-auto md:w-80 md:shrink-0 md:border-l md:bg-transparent">
      <div className="absolute top-2 right-2 flex gap-1">
        {bot && <ShareMenu bot={bot} />}
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label="Hide details"
          title="Hide details"
          render={
            <Link to="." search={(prev) => ({ ...prev, panel: undefined })} />
          }
          nativeButton={false}
        >
          <XIcon />
        </Button>
      </div>
      <div className="flex flex-col items-center gap-2 px-4 pt-10 pb-4 text-center">
        <BotAvatar
          portrait={portraitOf(bot ?? project)}
          className="size-16 shadow-lg"
        />
        <p className="text-base font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{bot?.role ?? 'Lead'}</p>
        <Link
          to={bot ? '/p/$projectId/bots' : '/p/$projectId/settings'}
          params={{ projectId: project._id }}
          search={bot ? { edit: bot._id } : {}}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Edit
        </Link>
      </div>
      <Tabs defaultValue="details" className="min-h-0 flex-1">
        <TabsList className="mx-auto">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="calls">Calls</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="flex flex-col gap-6 px-4 py-4">
          <DetailsTab project={project} bot={bot} />
        </TabsContent>
        <TabsContent value="library" className="flex flex-col gap-6 px-4 py-4">
          <LibraryTab project={project} threadId={threadId} />
        </TabsContent>
        <TabsContent value="calls" className="px-2 py-4">
          <CallHistory projectId={project._id} botId={bot?._id} name={name} />
        </TabsContent>
        <TabsContent value="costs" className="flex flex-col gap-6 px-4 py-4">
          <CostsTab threadId={threadId} />
        </TabsContent>
      </Tabs>
    </aside>
  )
}

/**
 * Each tab subscribes to what it shows. Base UI unmounts a hidden tab, so a
 * closed tab costs no queries.
 */
function DetailsTab({
  project,
  bot,
}: {
  project: Doc<'projects'>
  bot?: Doc<'bots'>
}) {
  const bots = useQuery(api.api.bots.list, { projectId: project._id })
  const channels = useQuery(api.api.channels.list, { projectId: project._id })
  const others = (bots ?? []).filter((b) => b._id !== bot?._id)
  const memberIds = (bot ?? project).memberIds ?? []
  const members = others.filter((b) => memberIds.includes(b._id))
  return (
    <>
      <Section title="About">
        <p className="line-clamp-6 text-muted-foreground">
          {bot?.instructions ?? (project.brief || 'No brief yet.')}
        </p>
        {project.guidelines && (
          <p className="line-clamp-3 text-muted-foreground">
            <span className="text-foreground">Guidelines:</span>{' '}
            {project.guidelines}
          </p>
        )}
      </Section>
      <Section title="Members">
        {members.length === 0 ? (
          <p className="text-muted-foreground">Works alone in this chat.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {members.map((m) => (
              <li key={m._id} className="flex items-center gap-2 text-xs">
                <BotAvatar portrait={portraitOf(m)} />
                <span className="truncate">{m.name}</span>
                <span className="truncate text-muted-foreground">{m.role}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Connectors">
        {CHANNELS.map((channel) => {
          const status = channels?.find((s) => s.id === channel.id)
          return (
            <Connector
              key={channel.id}
              name={channel.name}
              detail={status?.detail ?? ''}
              on={status?.status === 'connected'}
              action={
                (status?.status === 'ready' ||
                  status?.status === 'needs_setup') && (
                  <Link
                    to={
                      status.status === 'ready' && channel.via === 'photon'
                        ? '/p/$projectId/messaging'
                        : '/p/$projectId/connections'
                    }
                    params={{ projectId: project._id }}
                    className="underline"
                  >
                    {status.status === 'ready' ? 'Link' : 'Set up'}
                  </Link>
                )
              }
            />
          )
        })}
        <Link
          to="/p/$projectId/connections"
          params={{ projectId: project._id }}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          All connections
        </Link>
      </Section>
      <Section title="Environment">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Workspace</dt>
          <dd className="truncate">{project.name}</dd>
          <dt className="text-muted-foreground">Model</dt>
          <dd className="truncate">
            {bot?.model ?? project.model ?? MODELS.chat}
          </dd>
          <dt className="text-muted-foreground">Gateway</dt>
          <dd>Convex AI gateway</dd>
        </dl>
      </Section>
    </>
  )
}

function LibraryTab({
  project,
  threadId,
}: {
  project: Doc<'projects'>
  threadId?: string
}) {
  const plans = useQuery(api.api.plans.list, { projectId: project._id })
  const tasks = useQuery(
    api.api.tasks.forThread,
    threadId ? { threadId } : 'skip',
  )
  const reminders = useQuery(api.api.reminders.list, {
    projectId: project._id,
  })
  return (
    <>
      <Section title="Reminders">
        {!reminders?.length ? (
          <p className="text-muted-foreground">Nothing scheduled.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {reminders.map((r) => (
              <li key={r._id} className="flex items-center gap-2 text-xs">
                <AlarmClockIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{r.message}</span>
                <span className="shrink-0 text-muted-foreground">
                  {r.status === 'paused'
                    ? 'Paused'
                    : reminderWhen(r.dueAt, r.repeat?.every)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Tasks">
        {!tasks?.length ? (
          <p className="text-muted-foreground">No tasks in this chat.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tasks.map((task) => (
              <li key={task._id} className="flex items-center gap-2 text-xs">
                <ListChecksIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{task.title}</span>
                <span className="shrink-0 text-muted-foreground">
                  {TASK_STATUS[task.status]} ·{' '}
                  {task.steps.filter((s) => s.status === 'done').length}/
                  {task.steps.length}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Plans">
        {!plans?.length ? (
          <p className="text-muted-foreground">No plans yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {plans.map((p) => (
              <li key={p._id} className="flex items-center gap-2 text-xs">
                <ListChecksIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{p.title}</span>
                <span className="text-muted-foreground tabular-nums">
                  {p.steps.filter((s) => s.done).length}/{p.steps.length}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Link
        to="/p/$projectId/library"
        params={{ projectId: project._id }}
        className="text-xs text-muted-foreground underline hover:text-foreground"
      >
        Open the Library
      </Link>
    </>
  )
}

function CostsTab({ threadId }: { threadId?: string }) {
  const usage = useQuery(
    api.api.usage.forThread,
    threadId ? { threadId } : 'skip',
  )
  const budget = useQuery(api.api.usage.budget, {})
  const rows = usage ?? []
  const aiCost = rows.reduce((sum, r) => sum + r.aiCost, 0)
  const tokens = rows.reduce(
    (sum, r) => sum + r.inputTokens + r.outputTokens,
    0,
  )
  const computeMs = rows.reduce((sum, r) => sum + (r.computeMs ?? 0), 0)
  return (
    <>
      {budget && (
        <Section title="This month">
          <Stat
            label="AI budget"
            value={`${usd(budget.spent)} of ${usd(budget.cap)}`}
            hint={
              budget.spent >= budget.cap
                ? 'Used up. It starts over on the 1st.'
                : `${usd(budget.cap - budget.spent)} left, every assistant and call included`
            }
          />
        </Section>
      )}
      <Section title="This chat">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="AI" value={usd(aiCost)} hint={`${tokens} tokens`} />
          <Stat
            label="Convex (est.)"
            value={usd(computeMs * CONVEX_DOLLARS_PER_MS)}
            hint={`${(computeMs / 1000).toFixed(1)}s of actions`}
          />
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">
            {threadId ? 'Nothing spent yet.' : 'Costs show once you send.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {rows.map((r) => {
              const Icon = KIND_ICON[r.kind]
              return (
                <li key={r._id} className="flex items-center gap-2 text-xs">
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    {r.label}
                    {r.model && (
                      <span className="text-muted-foreground">
                        {' '}
                        · {modelName(r.model)}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {r.kind === 'compute'
                      ? `${((r.computeMs ?? 0) / 1000).toFixed(1)}s`
                      : `${usd(r.aiCost)} · ${r.inputTokens + r.outputTokens}t`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-lg border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-medium tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function Connector({
  name,
  detail,
  on,
  action,
}: {
  name: string
  detail: string
  on: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`size-2 rounded-full ${on ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
      />
      <span className="font-medium">{name}</span>
      <span className="flex-1 truncate text-muted-foreground">{detail}</span>
      {action}
    </div>
  )
}

/** Copy a bot into this workspace, or share a link others can copy it from. */
function ShareMenu({ bot }: { bot: Doc<'bots'> }) {
  const duplicate = useMutation(api.api.bots.duplicate)
  const navigate = useNavigate()
  const [status, setStatus] = React.useState<string>()
  const flash = (message: string) => {
    setStatus(message)
    setTimeout(() => setStatus(undefined), 2500)
  }
  const copy = async () => {
    try {
      const id = await duplicate({ id: bot._id })
      await navigate({
        to: '/p/$projectId',
        params: { projectId: bot.projectId },
        search: { bot: id, panel: true },
      })
    } catch (e) {
      flash(errorMessage(e, 'Could not copy it.'))
    }
  }
  const share = async () => {
    const template = encodeTemplate({
      name: bot.name,
      role: bot.role,
      instructions: bot.instructions,
      portrait: portraitOf(bot),
    })
    await navigator.clipboard.writeText(
      `${location.origin}/projects?template=${template}`,
    )
    flash('Template link copied')
  }
  return (
    <>
      {status && (
        <span className="self-center rounded-full bg-muted px-2 py-0.5 text-xs">
          {status}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" className="rounded-full" />
          }
          aria-label="Share"
          title="Share"
        >
          <ShareIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-60">
          <DropdownMenuItem onClick={() => void copy()}>
            <CopyIcon />
            <span className="flex flex-col">
              Create a copy
              <span className="text-xs text-muted-foreground">
                Adds {bot.name} copy to this workspace
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void attempt(share())}>
            <LinkIcon />
            <span className="flex flex-col">
              Copy template link
              <span className="text-xs text-muted-foreground">
                Anyone signed in can make their own
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
