import type { ChatUIMessage } from '~/components/chat-message'
import { Spinner } from '~/components/ui/spinner'

type PreviewToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-preview_post' }
>

type Post = Extract<PreviewToolPart, { state: 'output-available' }>['output']

const PLATFORM = {
  linkedin: 'LinkedIn',
  x: 'X',
  reddit: 'Reddit',
  discord: 'Discord',
} as const

/** The `preview_post` tool's card: the post laid out roughly as the platform shows it. Nothing is posted. */
export function PostPreviewPart({ part }: { part: PreviewToolPart }) {
  if (part.state === 'output-error') {
    return (
      <p className="px-1.5 text-sm text-muted-foreground">
        Couldn&rsquo;t preview the post: {part.errorText}
      </p>
    )
  }
  if (part.state !== 'output-available') {
    return (
      <div className="flex items-center gap-2 px-1.5 text-sm text-muted-foreground">
        <Spinner /> Laying out the post…
      </div>
    )
  }
  const post = part.output
  const over = post.text.length - post.limit
  return (
    <div className="mx-1.5 flex max-w-md flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{PLATFORM[post.platform]} preview</span>
        <span className={over > 0 ? 'text-destructive' : undefined}>
          {over > 0
            ? `${over.toLocaleString()} characters over`
            : `${post.text.length.toLocaleString()} / ${post.limit.toLocaleString()}`}
        </span>
      </div>
      <div className="rounded-xl border bg-card p-3 text-sm text-card-foreground">
        <Header post={post} />
        {post.platform === 'reddit' && post.title && (
          <p className="mt-2 text-base font-semibold">{post.title}</p>
        )}
        <p className="mt-2 whitespace-pre-wrap">{post.text}</p>
        <Footer platform={post.platform} />
      </div>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

function Header({ post }: { post: Post }) {
  if (post.platform === 'reddit') {
    return (
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          r/{post.subreddit ?? 'subreddit'}
        </span>{' '}
        · Posted by u/{post.author.toLowerCase().replace(/\s+/g, '')} · just now
      </p>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <Avatar name={post.author} />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="font-semibold">{post.author}</span>
        <span className="text-xs text-muted-foreground">
          {post.platform === 'linkedin'
            ? 'Now · Anyone'
            : post.platform === 'x'
              ? `@${post.author.toLowerCase().replace(/\s+/g, '')} · now`
              : 'Today'}
        </span>
      </div>
    </div>
  )
}

const ACTIONS = {
  linkedin: ['Like', 'Comment', 'Repost', 'Send'],
  x: ['Reply', 'Repost', 'Like', 'Share'],
  reddit: ['Upvote', 'Comment', 'Share'],
  discord: [],
} as const

function Footer({ platform }: { platform: Post['platform'] }) {
  const actions = ACTIONS[platform]
  if (actions.length === 0) return null
  return (
    <div className="mt-3 flex justify-between border-t pt-2 text-xs text-muted-foreground">
      {actions.map((a) => (
        <span key={a}>{a}</span>
      ))}
    </div>
  )
}
