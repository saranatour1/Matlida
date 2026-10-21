import { TableIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'

type TableToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-show_table' }
>

/** Options side by side, or a weekly plan: a table with an optional highlighted row. */
export function TablePart({ part }: { part: TableToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={TableIcon}>
        {failed
          ? `Couldn’t draw the table: ${part.errorText}`
          : 'Laying out the table…'}
      </ToolStatus>
    )
  }
  const { title, columns, rows, highlight, note } = part.output
  return (
    <div className="mx-1.5 flex flex-col gap-1.5">
      <p className="text-sm font-medium">{title}</p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={
                  i === highlight
                    ? 'border-t bg-primary/10 font-medium'
                    : 'border-t'
                }
              >
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}
