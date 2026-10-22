import { ArrowRightIcon, ReceiptIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'

type SplitToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-split_costs' }
>

/** Shared costs settled: who pays whom, then what each person paid and owed. */
export function SplitPart({ part }: { part: SplitToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={ReceiptIcon}>
        {failed
          ? `Couldn’t split it: ${part.errorText}`
          : 'Splitting the costs…'}
      </ToolStatus>
    )
  }
  const { currency, total, people, transfers, expenses } = part.output
  const money = (amount: number) =>
    `${currency}${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  return (
    <section
      aria-label="Settle up"
      className="mx-1.5 flex max-w-md flex-col gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground"
    >
      <div className="flex items-center gap-2">
        <ReceiptIcon className="size-4 text-muted-foreground" />
        <p className="flex-1 font-medium">Settle up</p>
        <span className="text-xs text-muted-foreground">
          {money(total)} across {expenses.length}{' '}
          {expenses.length === 1 ? 'cost' : 'costs'}
        </span>
      </div>
      {transfers.length === 0 ? (
        <p className="text-muted-foreground">Everyone’s even.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {transfers.map((t, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="font-medium">{t.from}</span>
              <ArrowRightIcon className="size-3.5 text-muted-foreground" />
              <span className="font-medium">{t.to}</span>
              <span className="ml-auto tabular-nums">{money(t.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 font-medium">Person</th>
            <th className="py-1 text-right font-medium">Paid</th>
            <th className="py-1 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.name} className="border-t">
              <td className="py-1">{p.name}</td>
              <td className="py-1 text-right tabular-nums">{money(p.paid)}</td>
              <td className="py-1 text-right tabular-nums">{money(p.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
