import { Link } from '@tanstack/react-router'
import { FileTextIcon } from 'lucide-react'
import type { SaveArtifactPart } from '~/components/chat-message'
import { Spinner } from '~/components/ui/spinner'

export function ArtifactPart({ part }: { part: SaveArtifactPart }) {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available':
      return (
        <div className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
          <Spinner />
          Writing {part.input?.title ?? 'a document'}…
        </div>
      )
    case 'output-available':
      return (
        <Link
          to="/artifacts/$artifactId"
          params={{ artifactId: part.output.id }}
          className="flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
        >
          <FileTextIcon className="size-4" />
          <span className="font-medium">{part.output.title}</span>
          <span className="text-muted-foreground">Open</span>
        </Link>
      )
    case 'output-error':
      return (
        <div className="px-1.5 text-sm text-destructive">
          Could not save the document: {part.errorText}
        </div>
      )
    default:
      return null
  }
}
