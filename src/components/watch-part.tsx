import { useMutation, useQuery } from 'convex/react'
import { TrendingDownIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { api } from '~/lib/api'
import { ToolStatus } from '~/components/tool-part'
import { Button } from '~/components/ui/button'
import { money } from '~/lib/money'
import { attempt } from '~/lib/attempt'
import { CardGone, CardSkeleton } from '~/components/card-skeleton'

type WatchToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-watch_price' }
>

const STATUS = {
  watching: 'Checked daily. You’ll hear here when it drops.',
  dropped: 'It dropped. See the message below.',
  gone: 'The store stopped selling it.',
  stopped: 'Stopped watching.',
}

/** A price being watched: the price now, the one you want, and Stop. */
export function WatchPart({ part }: { part: WatchToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={TrendingDownIcon}>
        {failed
          ? `Couldn’t watch it: ${part.errorText}`
          : 'Setting up a price watch…'}
      </ToolStatus>
    )
  }
  return <Watch id={part.output.watchId} />
}

function Watch({ id }: { id: string }) {
  const watch = useQuery(api.shopping.watch, { id })
  const stop = useMutation(api.shopping.stopWatch)
  if (watch === undefined) return <CardSkeleton />
  if (watch === null) {
    return <CardGone>This price watch was removed.</CardGone>
  }
  return (
    <section
      aria-label={`Price watch: ${watch.title}`}
      className="mx-1.5 flex max-w-md flex-col gap-2 rounded-xl border bg-card p-4 text-sm text-card-foreground"
    >
      <div className="flex items-start gap-2">
        <TrendingDownIcon className="mt-0.5 size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <a
            href={watch.url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline"
          >
            {watch.title}
          </a>
          {watch.variantTitle && (
            <p className="text-xs text-muted-foreground">
              {watch.variantTitle}
            </p>
          )}
        </div>
      </div>
      <p className="tabular-nums">
        Now {money(watch.lastPrice, watch.currency, true)} · tell you at{' '}
        {money(watch.target, watch.currency, true)} or less
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex-1">{STATUS[watch.status]}</span>
        {watch.status === 'watching' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => void attempt(stop({ id: watch._id }))}
          >
            Stop
          </Button>
        )}
      </div>
    </section>
  )
}
