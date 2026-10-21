import '@excalidraw/excalidraw/index.css'
import * as React from 'react'
import {
  Excalidraw,
  convertToExcalidrawElements,
  exportToBlob,
  serializeAsJSON,
} from '@excalidraw/excalidraw'
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw'
import { DownloadIcon, ImageIcon, ShapesIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'

type Api = Parameters<
  NonNullable<React.ComponentProps<typeof Excalidraw>['excalidrawAPI']>
>[0]

// One parse per diagram, kept so re-renders reuse it. ponytail: never emptied, fine for one chat's diagrams.
const scenes = new Map<string, ReturnType<typeof toScene>>()

async function toScene(mermaid: string) {
  const { elements, files } = await parseMermaidToExcalidraw(mermaid)
  return { elements: convertToExcalidrawElements(elements), files }
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

/** The Excalidraw canvas for one diagram, with downloads. Loaded lazily by `DiagramPart`. */
export default function DiagramCanvas({
  title,
  mermaid,
}: {
  title: string
  mermaid: string
}) {
  if (!scenes.has(mermaid)) scenes.set(mermaid, toScene(mermaid))
  const scene = React.use(scenes.get(mermaid)!)
  const [api, setApi] = React.useState<Api | null>(null)
  const dark = document.documentElement.classList.contains('dark')
  const name = title.replace(/[^\w -]+/g, '').trim() || 'diagram'

  const saveFile = () => {
    if (!api) return
    const json = serializeAsJSON(
      api.getSceneElements(),
      api.getAppState(),
      api.getFiles(),
      'local',
    )
    download(
      new Blob([json], { type: 'application/json' }),
      `${name}.excalidraw`,
    )
  }
  const savePng = async () => {
    if (!api) return
    const png = await exportToBlob({
      elements: api.getSceneElements(),
      appState: { ...api.getAppState(), exportBackground: true },
      files: api.getFiles(),
      mimeType: 'image/png',
    })
    download(png, `${name}.png`)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <ShapesIcon className="size-4 text-muted-foreground" />
        <p className="flex-1 truncate font-medium">{title}</p>
        <Button variant="ghost" size="sm" disabled={!api} onClick={savePng}>
          <ImageIcon />
          PNG
        </Button>
        <Button variant="ghost" size="sm" disabled={!api} onClick={saveFile}>
          <DownloadIcon />
          .excalidraw
        </Button>
      </div>
      <div className="h-96 overflow-hidden rounded-lg border">
        <Excalidraw
          initialData={{ ...scene, scrollToContent: true }}
          excalidrawAPI={setApi}
          theme={dark ? 'dark' : 'light'}
          UIOptions={{ canvasActions: { loadScene: false } }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Edit it here. Open the .excalidraw file on excalidraw.com to keep
        working on it there.
      </p>
    </>
  )
}
