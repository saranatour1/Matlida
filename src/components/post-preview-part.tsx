import { MegaphoneIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { CopyButton } from '~/components/copy-button'
import { ToolStatus } from '~/components/tool-part'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'

type PreviewToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-preview_post' }
>
type PreviewsToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-preview_posts' }
>
type Platform = 'linkedin' | 'x' | 'reddit' | 'discord'
type Post = {
  platform: Platform
  text: string
  label?: string
  title?: string
  subreddit?: string
  channel?: string
  author: string
  limit: number
}

const PLATFORM = {
  linkedin: 'LinkedIn',
  x: 'X',
  reddit: 'Reddit',
  discord: 'Discord',
} as const

/**
 * The `preview_posts` card: sets of drafts, a tab per platform, each version
 * laid out roughly as the platform shows it, with Copy. Nothing is posted.
 */
export function PostPreviewsPart({ part }: { part: PreviewsToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={MegaphoneIcon}>
        {failed
          ? `Couldn’t preview the posts: ${part.errorText}`
          : 'Laying out the posts…'}
      </ToolStatus>
    )
  }
  const { author, posts } = part.output
  const platforms = [...new Set(posts.map((p) => p.platform))]
  const versions = (platform: Platform) =>
    posts
      .filter((p) => p.platform === platform)
      .map((p, i) => <PostCard key={i} post={{ ...p, author }} />)
  return (
    <section
      aria-label="Post previews"
      className="mx-1.5 flex max-w-md flex-col gap-2"
    >
      {platforms.length === 1 ? (
        versions(platforms[0])
      ) : (
        <Tabs defaultValue={platforms[0]}>
          <TabsList>
            {platforms.map((platform) => (
              <TabsTrigger key={platform} value={platform}>
                {PLATFORM[platform]}
              </TabsTrigger>
            ))}
          </TabsList>
          {platforms.map((platform) => (
            <TabsContent
              key={platform}
              value={platform}
              className="flex flex-col gap-3"
            >
              {versions(platform)}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  )
}

/** The older one-post `preview_post` card, still shown in chats from before sets. */
export function PostPreviewPart({ part }: { part: PreviewToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={MegaphoneIcon}>
        {failed ? `Couldn’t preview the post.` : 'Laying out the post…'}
      </ToolStatus>
    )
  }
  return (
    <div className="mx-1.5 max-w-md">
      <PostCard post={part.output} />
    </div>
  )
}

function PostCard({ post }: { post: Post }) {
  const over = post.text.length - post.limit
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex-1">
          {post.label ? (
            <span className="font-medium text-foreground">{post.label}</span>
          ) : (
            `${PLATFORM[post.platform]} preview`
          )}
        </span>
        <span className={over > 0 ? 'text-destructive' : undefined}>
          {over > 0
            ? `${over.toLocaleString()} characters over`
            : `${post.text.length.toLocaleString()} / ${post.limit.toLocaleString()}`}
        </span>
        <CopyButton
          text={post.title ? `${post.title}\n\n${post.text}` : post.text}
          className="h-6 px-1.5"
        />
      </div>
      {post.platform === 'discord' ? (
        <DiscordMessage post={post} />
      ) : (
        <div className="rounded-xl border bg-card p-3 text-sm text-card-foreground">
          <Header post={post} />
          {post.platform === 'reddit' && post.title && (
            <p className="mt-2 text-base font-semibold">{post.title}</p>
          )}
          <p className="mt-2 whitespace-pre-wrap">{post.text}</p>
          <Footer platform={post.platform} />
        </div>
      )}
    </div>
  )
}

/** Discord's look: a channel header, then the message with a colored name and today's time. */
function DiscordMessage({ post }: { post: Post }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#1e1f22] bg-[#313338] text-sm text-[#dbdee1]">
      <p className="border-b border-[#1e1f22] px-3 py-2 font-semibold text-[#f2f3f5]">
        <span className="mr-1 text-[#80848e]">#</span>
        {post.channel ?? 'general'}
      </p>
      <div className="flex gap-3 p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#5865f2] text-sm font-medium text-white">
          {post.author.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="leading-tight">
            <span className="font-medium text-[#f2f3f5]">{post.author}</span>{' '}
            <span className="text-xs text-[#949ba4]">
              Today at{' '}
              {new Date().toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </p>
          <p className="mt-0.5 whitespace-pre-wrap">{post.text}</p>
        </div>
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
            : `@${post.author.toLowerCase().replace(/\s+/g, '')} · now`}
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

function Footer({ platform }: { platform: Platform }) {
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
