import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { FileTextIcon, RefreshCwIcon } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { CardSkeleton } from '~/components/card-skeleton'

type PageToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-write_page' }
>
type KeepToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-keep_page_updated' }
>

/** A page an assistant wrote: its title, kind, first lines and numbers, live, with Open. */
export function PagePart({ part }: { part: PageToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={FileTextIcon}>
        {failed
          ? `Couldn’t save the page: ${part.errorText}`
          : `Writing ${part.input?.title ? `“${part.input.title}”` : 'the page'}…`}
      </ToolStatus>
    )
  }
  return <PageCard id={part.output.pageId} />
}

function PageCard({ id }: { id: string }) {
  const { projectId } = useParams({ strict: false })
  const page = useQuery(api.api.pages.get, { id })
  if (page === undefined) return <CardSkeleton />
  if (page === null) {
    return (
      <p className="px-1.5 text-sm text-muted-foreground">
        This page was deleted.
      </p>
    )
  }
  const excerpt = page.markdown
    .replace(/[#*_>`[\]()-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
  return (
    <section
      aria-label={`Page: ${page.title}`}
      className="mx-1.5 flex max-w-md flex-col gap-2 rounded-xl border bg-card p-4 text-sm text-card-foreground"
    >
      <div className="flex items-center gap-2">
        <FileTextIcon className="size-4 text-muted-foreground" />
        <p className="flex-1 truncate font-medium">{page.title}</p>
        <Badge variant="secondary" className="capitalize">
          {page.kind}
        </Badge>
      </div>
      {page.metrics && page.metrics.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {page.metrics.slice(0, 4).map((m) => (
            <li key={m.label}>
              <span className="text-xs text-muted-foreground">{m.label} </span>
              <span className="font-medium tabular-nums">
                {m.value.toLocaleString()}
                {m.suffix}
              </span>
            </li>
          ))}
        </ul>
      )}
      {excerpt && (
        <p className="line-clamp-3 text-muted-foreground">{excerpt}</p>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {projectId && (
          <Button
            size="sm"
            variant="secondary"
            nativeButton={false}
            render={
              <Link
                to="/p/$projectId/pages/$pageId"
                params={{ projectId, pageId: page._id }}
              />
            }
          >
            Open the page
          </Button>
        )}
        <span>Saved by {page.updatedBy}</span>
      </div>
    </section>
  )
}

/** One line when an assistant starts or stops keeping a page up to date. */
export function KeepUpdatedPart({ part }: { part: KeepToolPart }) {
  const failed = part.state === 'output-error'
  if (part.state !== 'output-available') {
    return (
      <ToolStatus failed={failed} icon={RefreshCwIcon}>
        {failed ? `Couldn’t set that up: ${part.errorText}` : 'Setting it up…'}
      </ToolStatus>
    )
  }
  return (
    <p
      role="status"
      className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground"
    >
      <RefreshCwIcon className="size-4" />
      {part.output.every === 'off'
        ? 'No longer kept up to date.'
        : `Kept up to date every ${part.output.every}.`}
    </p>
  )
}
