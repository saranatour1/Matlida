import type { Doc } from '../../convex/_generated/dataModel'
import { MetricCard } from '~/components/ui/arc/metric-card/metric-card'
import { Sparkline } from '~/components/ui/arc/sparkline/sparkline'
import '~/components/ui/arc/arc.css'

/** A dashboard's headline numbers, with Arc's metric cards and sparklines (uiarc.dev). */
export function PageMetrics({
  metrics,
}: {
  metrics: NonNullable<Doc<'pages'>['metrics']>
}) {
  return (
    <div
      className="arc grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      role="list"
      aria-label="Headline numbers"
    >
      {metrics.map((m) => (
        <div key={m.label} role="listitem" className="flex flex-col gap-2">
          <MetricCard
            label={m.label}
            value={m.value}
            suffix={m.suffix}
            change={m.change}
            context={m.context ?? ''}
          />
          {m.trend && m.trend.length > 1 && (
            <Sparkline
              data={m.trend}
              label={`${m.label} trend`}
              width={240}
              height={44}
            />
          )}
        </div>
      ))}
    </div>
  )
}
