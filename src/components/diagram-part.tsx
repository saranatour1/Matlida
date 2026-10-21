import * as React from 'react'
import { ShapesIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'

// Excalidraw and the Mermaid parser are big, so they load with the first diagram.
const DiagramCanvas = React.lazy(() => import('~/components/diagram-canvas'))

type DiagramToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-draw_diagram' }
>

/** A diagram an assistant drew, on an Excalidraw canvas you can edit and download. */
export function DiagramPart({ part }: { part: DiagramToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={ShapesIcon}>
        {failed ? 'Couldn’t draw the diagram.' : 'Drawing…'}
      </ToolStatus>
    )
  }
  const { title, mermaid } = part.output
  return (
    <section
      aria-label={`Diagram: ${title}`}
      className="mx-1.5 flex flex-col gap-2 rounded-xl border bg-card p-3 text-sm text-card-foreground"
    >
      <React.Suspense
        fallback={
          <ToolStatus failed={false} icon={ShapesIcon}>
            Opening Excalidraw…
          </ToolStatus>
        }
      >
        <DiagramCanvas title={title} mermaid={mermaid} />
      </React.Suspense>
    </section>
  )
}
