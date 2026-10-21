import { useQuery } from 'convex/react'
import { ClapperboardIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'

type VideoToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-generate_video' }
>

/** A video an assistant is making in the background, live until it's ready to play. */
export function VideoPart({ part }: { part: VideoToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={ClapperboardIcon}>
        {failed
          ? `Couldn’t start the video: ${part.errorText}`
          : 'Starting the video…'}
      </ToolStatus>
    )
  }
  return <VideoCard id={part.output.videoId} />
}

function VideoCard({ id }: { id: string }) {
  const video = useQuery(api.api.videos.get, { id })
  if (video === undefined) return null
  if (video?.status === 'working') {
    return (
      <ToolStatus failed={false} icon={ClapperboardIcon}>
        Making the video. It takes a few minutes…
      </ToolStatus>
    )
  }
  if (video?.status === 'failed') {
    return (
      <ToolStatus failed icon={ClapperboardIcon}>
        Couldn’t make the video: {video.error}
      </ToolStatus>
    )
  }
  if (!video?.url) {
    return (
      <p className="px-1.5 text-sm text-muted-foreground">
        This video was deleted.
      </p>
    )
  }
  return (
    <video
      src={video.url}
      controls
      playsInline
      aria-label={video.prompt}
      className="mx-1.5 max-h-[70svh] max-w-sm rounded-xl border"
    />
  )
}
