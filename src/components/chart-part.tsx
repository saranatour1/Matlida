import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChatUIMessage } from '~/components/chat-message'
import { Spinner } from '~/components/ui/spinner'

type ChartToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-show_chart' }
>

/** The theme's chart colors, so charts follow light and dark. */
const COLORS = [1, 2, 3, 4, 5].map((n) => `var(--chart-${n})`)

/** The `show_chart` tool's card: the chart Recharts draws from the tool's data. */
export function ChartPart({ part }: { part: ChartToolPart }) {
  if (part.state === 'output-error') {
    return (
      <p className="px-1.5 text-sm text-muted-foreground">
        Couldn&rsquo;t draw the chart: {part.errorText}
      </p>
    )
  }
  if (part.state !== 'output-available') {
    return (
      <div className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
        <Spinner /> Drawing a chart…
      </div>
    )
  }
  const chart = part.output
  const format = (value: number) =>
    chart.unit === '$'
      ? `$${value.toLocaleString()}`
      : `${value.toLocaleString()}${chart.unit ? ` ${chart.unit}` : ''}`
  const rows = chart.points.map((p) => ({
    label: p.label,
    ...Object.fromEntries(chart.series.map((s, i) => [s, p.values[i]])),
  }))
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 12 }}
        stroke="var(--muted-foreground)"
      />
      <YAxis
        tickFormatter={format}
        tick={{ fontSize: 12 }}
        width={56}
        stroke="var(--muted-foreground)"
      />
      <Tooltip formatter={(v) => format(Number(v))} />
      {chart.series.length > 1 && <Legend />}
    </>
  )
  return (
    <figure className="mx-1.5 flex flex-col gap-2 rounded-xl border p-3">
      <figcaption className="text-sm font-medium">{chart.title}</figcaption>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          {chart.kind === 'pie' ? (
            <PieChart>
              <Pie
                data={rows}
                dataKey={chart.series[0]}
                nameKey="label"
                outerRadius="80%"
                label={({ name }) => String(name)}
              >
                {rows.map((row, i) => (
                  <Cell key={row.label} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => format(Number(v))} />
            </PieChart>
          ) : chart.kind === 'bar' ? (
            <BarChart data={rows}>
              {axes}
              {chart.series.map((s, i) => (
                <Bar key={s} dataKey={s} fill={COLORS[i]} radius={4} />
              ))}
            </BarChart>
          ) : chart.kind === 'area' ? (
            <AreaChart data={rows}>
              {axes}
              {chart.series.map((s, i) => (
                <Area
                  key={s}
                  dataKey={s}
                  stroke={COLORS[i]}
                  fill={COLORS[i]}
                  fillOpacity={0.25}
                />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={rows}>
              {axes}
              {chart.series.map((s, i) => (
                <Line key={s} dataKey={s} stroke={COLORS[i]} strokeWidth={2} />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {chart.source && (
        <p className="text-xs text-muted-foreground">Source: {chart.source}</p>
      )}
    </figure>
  )
}
