import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { CHANNELS, STATUS_LABELS } from '@convex/lib/channels'
import type { Channel, ChannelStatus } from '@convex/lib/channels'
import type { Doc } from '@convex/_generated/dataModel'
import { api } from '~/lib/api'
import { EmailAddress } from '~/components/email-address'
import { Button } from '~/components/ui/button'
import { useProject } from '~/hooks/use-project'

export const Route = createFileRoute('/_app/p/$projectId/connections')({
  component: Connections,
})

/** How Connections groups the registry: ways to reach the assistants, then what they can use. */
const GROUPS: ReadonlyArray<{
  title: string
  vias: ReadonlyArray<Channel['via']>
}> = [
  {
    title: 'Reach your assistants',
    vias: ['email', 'photon', 'phone', 'planned'],
  },
  { title: 'What they can use', vias: ['tool'] },
]

const DOT: Record<ChannelStatus, string> = {
  connected: 'bg-emerald-500',
  ready: 'bg-amber-500',
  needs_setup: 'bg-muted-foreground/40',
  coming_soon: 'border border-dashed border-muted-foreground/60',
}

type Status = NonNullable<
  ReturnType<typeof useQuery<typeof api.channels.list>>
>[number]

/** Every channel the app supports, and whether this workspace has it connected. */
function Connections() {
  const project = useProject()
  const statuses = useQuery(
    api.channels.list,
    project ? { projectId: project._id } : 'skip',
  )
  if (!project) {
    return project === null ? (
      <p className="p-6 text-sm text-muted-foreground">Project not found.</p>
    ) : null
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">Connections</h1>
          <p className="text-sm text-muted-foreground">
            Every way to reach {project.name} and the bots, and what they can
            use. A channel that needs deployment setup lists the env vars to set
            on Convex. Nothing here shows their values.
          </p>
        </div>
        {GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-2">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {group.title}
            </h2>
            <ul className="flex flex-col divide-y rounded-xl border text-sm">
              {CHANNELS.filter((c) => group.vias.includes(c.via)).map(
                (channel) => (
                  <Row
                    key={channel.id}
                    channel={channel}
                    status={statuses?.find((s) => s.id === channel.id)}
                    project={project}
                  />
                ),
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function Row({
  channel,
  status,
  project,
}: {
  channel: Channel
  status?: Status
  project: Doc<'projects'>
}) {
  return (
    <li className="flex items-start gap-3 p-4">
      <span
        className={`mt-1.5 size-2 shrink-0 rounded-full ${status ? DOT[status.status] : 'bg-muted'}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {channel.name}
          {status && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {STATUS_LABELS[status.status]}
            </span>
          )}
        </p>
        <p className="text-muted-foreground">{channel.description}</p>
        {status && status.missing.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Set{' '}
            {status.missing.map((name, i) => (
              <span key={name}>
                {i > 0 && ', '}
                <code>{name}</code>
              </span>
            ))}{' '}
            on the Convex deployment.
          </p>
        ) : (
          status && (
            <p className="mt-1 text-xs text-muted-foreground">
              {status.detail}
            </p>
          )
        )}
        {channel.via === 'email' && status?.status !== 'needs_setup' && (
          <EmailAddress project={project} />
        )}
      </div>
      {channel.via === 'photon' &&
        (status?.status === 'ready' || status?.status === 'connected') && (
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                to="/p/$projectId/messaging"
                params={{ projectId: project._id }}
              />
            }
            nativeButton={false}
          >
            {status.status === 'connected' ? 'Manage' : 'Link'}
          </Button>
        )}
    </li>
  )
}
