import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import {
  CpuIcon,
  GlobeIcon,
  ListChecksIcon,
  MessageSquareIcon,
  TelescopeIcon,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { MODELS } from '../../convex/lib/models'
import type { Doc } from '../../convex/_generated/dataModel'
import type * as React from 'react'
import { Orb, defaultAvatar } from '~/components/orb'

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
} as const

/** The right sidebar for a chat: costs, context, connectors, environment and changes. */
export function AssistantPanel({
  project,
  bot,
  threadId,
}: {
  project: Doc<'projects'>
  bot?: Doc<'bots'>
  threadId?: string
}) {
  const usage = useQuery(
    api.api.usage.forThread,
    threadId ? { threadId } : 'skip',
  )
  const thread = useQuery(api.api.threads.get, threadId ? { threadId } : 'skip')
  const bots = useQuery(api.api.bots.list, { projectId: project._id })
  const plans = useQuery(api.api.plans.list, { projectId: project._id })
  const link = useQuery(api.api.texts.link, { projectId: project._id })
  const calls = useQuery(api.api.reminders.callStatus)

  const rows = usage ?? []
  const aiCost = rows.reduce((sum, r) => sum + r.aiCost, 0)
  const tokens = rows.reduce(
    (sum, r) => sum + r.inputTokens + r.outputTokens,
    0,
  )
  const computeMs = rows.reduce((sum, r) => sum + (r.computeMs ?? 0), 0)
  const others = (bots ?? []).filter((b) => b._id !== bot?._id)
  const memberIds = thread?.memberIds ?? (bot ? [] : others.map((b) => b._id))
  const members = others.filter((b) => memberIds.includes(b._id))
  const chatPlans = (plans ?? []).filter((p) => p.threadId === threadId)
  const name = bot?.name ?? project.name

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto border-l px-4 py-4 text-sm">
      <Section title="Costs">
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
                  <span className="flex-1 truncate">{r.label}</span>
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

      <Section title="Context">
        <div className="flex items-center gap-2">
          <Orb
            avatar={(bot ?? project).avatar ?? defaultAvatar(name)}
            className="size-6"
          />
          <p>
            <span className="font-medium">{name}</span>{' '}
            <span className="text-muted-foreground">
              · {bot?.role ?? 'Lead'}
            </span>
          </p>
        </div>
        <p className="line-clamp-4 text-muted-foreground">
          {bot?.instructions ?? (project.brief || 'No brief yet.')}
        </p>
        {project.guidelines && (
          <p className="line-clamp-3 text-muted-foreground">
            <span className="text-foreground">Guidelines:</span>{' '}
            {project.guidelines}
          </p>
        )}
        <p className="text-muted-foreground">
          <span className="text-foreground">Members:</span>{' '}
          {members.length ? members.map((m) => m.name).join(', ') : 'none'}
        </p>
      </Section>

      <Section title="Connectors">
        <Connector name="Web search" detail={MODELS.search} on />
        <Connector name="Research" detail={MODELS.research} on />
        <Connector name="Voice input" detail={MODELS.transcription} on />
        <Connector
          name="Texting"
          detail="Photon"
          on={link?.status === 'linked'}
          action={
            link?.status !== 'linked' && (
              <Link
                to="/p/$projectId/texting"
                params={{ projectId: project._id }}
                className="underline"
              >
                Set up
              </Link>
            )
          }
        />
        <Connector
          name="Calls"
          detail="Vapi over Photon"
          on={Boolean(calls?.configured && calls.phone)}
          action={
            !(calls?.configured && calls.phone) && (
              <Link
                to="/p/$projectId/settings"
                params={{ projectId: project._id }}
                className="underline"
              >
                {calls?.configured ? 'Add number' : 'Not set up'}
              </Link>
            )
          }
        />
      </Section>

      <Section title="Environment">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Workspace</dt>
          <dd className="truncate">{project.name}</dd>
          <dt className="text-muted-foreground">Model</dt>
          <dd className="truncate">{MODELS.chat}</dd>
          <dt className="text-muted-foreground">Gateway</dt>
          <dd>Convex AI gateway</dd>
        </dl>
      </Section>

      <Section title="Changes">
        {chatPlans.length === 0 ? (
          <p className="text-muted-foreground">No plans from this chat yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {chatPlans.map((p) => (
              <li key={p._id} className="flex items-center gap-2 text-xs">
                <ListChecksIcon className="size-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">{p.title}</span>
                <span className="text-muted-foreground tabular-nums">
                  {p.steps.filter((s) => s.done).length}/{p.steps.length}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </aside>
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
