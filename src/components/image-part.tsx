import { ImageIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'

type ImageToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-generate_image' }
>

/** A picture an assistant made, served from Convex storage. Opens full size. */
export function ImagePart({ part }: { part: ImageToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={ImageIcon}>
        {failed
          ? `Couldn’t make the picture: ${part.errorText}`
          : 'Making the picture…'}
      </ToolStatus>
    )
  }
  const { url, prompt } = part.output
  if (!url) {
    return (
      <p className="px-1.5 text-sm text-muted-foreground">
        This picture was deleted.
      </p>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mx-1.5 block max-w-sm overflow-hidden rounded-xl border"
    >
      <img src={url} alt={prompt} loading="lazy" className="w-full" />
    </a>
  )
}
