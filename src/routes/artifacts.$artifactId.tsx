import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { TextPart } from '~/components/parts/text-part'
import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/artifacts/$artifactId')({
  component: ArtifactPreview,
})

function ArtifactPreview() {
  const { artifactId } = Route.useParams()
  const artifact = useQuery(api.artifacts.get, { id: artifactId })

  if (artifact === undefined) return null
  if (artifact === null) {
    return (
      <p className="p-6 text-sm text-muted-foreground">Artifact not found.</p>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <article className="mx-auto w-full max-w-2xl px-6 py-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold">{artifact.title}</h1>
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/" search={{ thread: artifact.threadId }} />}
            nativeButton={false}
          >
            Open chat
          </Button>
        </div>
        <TextPart text={artifact.content} />
      </article>
    </div>
  )
}
