import { FileTextIcon, PencilIcon, RotateCcwIcon } from 'lucide-react'
import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { UIMessage } from '@convex-dev/agent/react'
import type { InferUITools, UIDataTypes } from 'ai'
import type { assistantTools } from '@convex/models/threads/tools'
import { BotPart } from '~/components/bot-part'
import { CartPart } from '~/components/cart-part'
import { ChecklistPart } from '~/components/checklist-part'
import { CommandsPart } from '~/components/commands-part'
import { StudyPart } from '~/components/study-part'
import { CopyButton } from '~/components/copy-button'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'
import { DraftsPart } from '~/components/drafts-part'
import { ProblemCheckPart } from '~/components/problem-check-part'
import { ImagePart } from '~/components/image-part'
import { NewsPart, NewsSetupPart } from '~/components/news-part'
import { KeepUpdatedPart, PagePart } from '~/components/page-part'
import {
  PostPreviewPart,
  PostPreviewsPart,
} from '~/components/post-preview-part'
import { ProductsPart } from '~/components/products-part'
import { RecipePart } from '~/components/recipe-part'
import { SplitPart } from '~/components/split-part'
import { TablePart } from '~/components/table-part'
import { TimeZonesPart } from '~/components/time-zones-part'
import { TimelinePart } from '~/components/timeline-part'
import { TimerPart } from '~/components/timer-part'
import { TodayPart } from '~/components/today-part'
import { VideoPart } from '~/components/video-part'
import { WatchPart } from '~/components/watch-part'
import { RunPlanPart } from '~/components/task-card'
import {
  CallPhonePart,
  DecidePart,
  ReminderPart,
  ToolPart,
} from '~/components/tool-part'
import { Bubble, BubbleContent } from '~/components/ui/bubble'
import { Message, MessageContent } from '~/components/ui/message'

// Recharts is big, so it loads with the first chart.
const ChartPart = React.lazy(() =>
  import('~/components/chart-part').then((m) => ({ default: m.ChartPart })),
)

/** The assistants' tools, typed from `assistantTools` itself, plus `ask_bot` from `lead.ts`. */
export type ChatUIMessage = UIMessage<
  unknown,
  UIDataTypes,
  InferUITools<ReturnType<typeof assistantTools>> & {
    ask_bot: {
      input: { bot: string; task: string }
      output: { name: string; role: string; reply: string; botId: string }
    }
  }
>

export type AskBotPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-ask_bot' }
>

export function Markdown({ text }: { text: string }) {
  return (
    <div className="typeset typeset-docs px-1.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ pre: CodeBlock, img: NoImage }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

/** An image in a reply or a quoted email, as a link: fetching it would tell its host when you read this. */
function NoImage({ src, alt }: { src?: string | Blob; alt?: string }) {
  const url = typeof src === 'string' ? src : ''
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      {alt || 'image'}
    </a>
  ) : null
}

/** A code block, with Copy in its corner. */
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const ref = React.useRef<HTMLPreElement>(null)
  return (
    <div className="group/code relative">
      <pre ref={ref}>{children}</pre>
      <CopyButton
        compact
        label="Copy code"
        text={() => ref.current?.innerText ?? ''}
        className="absolute top-1.5 right-1.5 bg-background/80 md:opacity-0 md:group-hover/code:opacity-100 focus-visible:opacity-100"
      />
    </div>
  )
}

/** The message's own words, without its cards, for Copy. */
function textOf(message: ChatUIMessage) {
  return message.parts
    .flatMap((part) => (part.type === 'text' ? [part.text.trim()] : []))
    .filter(Boolean)
    .join('\n\n')
}

const HOVER =
  'md:opacity-0 md:group-hover/message:opacity-100 focus-visible:opacity-100'

/**
 * One chat message. User messages are bubbles, replies are markdown and tool
 * cards. `onSend` lets a card send a message, like a command pill. `onEdit`
 * (on your messages) and `onRetry` (on the last reply) are there when nothing
 * is running.
 */
export function ChatMessage({
  message,
  onSend,
  onEdit,
  onRetry,
}: {
  message: ChatUIMessage
  onSend?: (prompt: string) => void
  onEdit?: (prompt: string) => void
  onRetry?: () => void
}) {
  if (message.role === 'user') {
    return <UserMessage message={message} onEdit={onEdit} />
  }
  return (
    <Message align="start">
      <MessageContent>
        {message.parts.map((part, index) => (
          <PartBoundary key={'toolCallId' in part ? part.toolCallId : index}>
            {renderPart(part, index, onSend, message.status === 'failed')}
          </PartBoundary>
        ))}
        <div className="flex gap-0.5">
          {textOf(message) && (
            <CopyButton
              compact
              label="Copy reply"
              text={() => textOf(message)}
              className={HOVER}
            />
          )}
          {onRetry && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Retry"
              title="Retry: answer again"
              className={HOVER}
              onClick={onRetry}
            >
              <RotateCcwIcon />
            </Button>
          )}
        </div>
      </MessageContent>
    </Message>
  )
}

/** Your message, which you can edit and send again. That drops everything after it. */
function UserMessage({
  message,
  onEdit,
}: {
  message: ChatUIMessage
  onEdit?: (prompt: string) => void
}) {
  const [editing, setEditing] = React.useState(false)
  return (
    <Message align="end">
      <MessageContent>
        <Attachments parts={message.parts} />
        {editing && onEdit ? (
          <form
            className="flex w-full max-w-xl flex-col gap-2 self-end"
            action={(data) => {
              setEditing(false)
              onEdit(String(data.get('prompt')))
            }}
          >
            <Textarea
              name="prompt"
              defaultValue={message.text}
              required
              maxLength={4000}
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span className="mr-auto">
                Sending drops everything after this message.
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Send
              </Button>
            </div>
          </form>
        ) : (
          <Bubble align="end" variant="muted">
            <BubbleContent>{message.text}</BubbleContent>
          </Bubble>
        )}
        <div className="flex gap-0.5 self-end">
          {onEdit && !editing && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Edit message"
              title="Edit and send again"
              className={HOVER}
              onClick={() => setEditing(true)}
            >
              <PencilIcon />
            </Button>
          )}
          <CopyButton
            compact
            label="Copy message"
            text={message.text}
            className={HOVER}
          />
        </div>
      </MessageContent>
    </Message>
  )
}

type Part = ChatUIMessage['parts'][number]

/** Pictures and PDFs sent with a message: thumbnails and chips that open them. */
function Attachments({ parts }: { parts: Array<Part> }) {
  const files = parts.filter((p) => p.type === 'file')
  if (files.length === 0) return null
  return (
    <ul aria-label="Attachments" className="flex flex-wrap justify-end gap-2">
      {files.map((file) => (
        <li key={file.url}>
          <a href={file.url} target="_blank" rel="noreferrer">
            {file.mediaType.startsWith('image/') ? (
              <img
                src={file.url}
                alt={file.filename ?? 'Attached picture'}
                className="max-h-40 max-w-56 rounded-xl border object-cover"
              />
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs">
                <FileTextIcon className="size-4 text-muted-foreground" />
                {file.filename ?? 'Attached file'}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  )
}

function renderPart(
  part: Part,
  index: number,
  onSend?: (prompt: string) => void,
  /** The reply died or was stopped, so a tool still waiting won't finish. */
  stopped = false,
) {
  switch (part.type) {
    case 'text':
      return part.text.trim() ? <Markdown key={index} text={part.text} /> : null
    case 'tool-ask_bot':
      return <BotPart key={part.toolCallId} part={part} />
    case 'tool-web_search':
    case 'tool-research':
      return <ToolPart key={part.toolCallId} part={part} />
    case 'tool-save_plan':
    case 'tool-add_to_list':
      return <ChecklistPart key={part.toolCallId} part={part} />
    case 'tool-show_drafts':
      return <DraftsPart key={part.toolCallId} part={part} />
    case 'tool-show_table':
      return <TablePart key={part.toolCallId} part={part} />
    case 'tool-show_recipe':
      return <RecipePart key={part.toolCallId} part={part} />
    case 'tool-get_today':
      return <TodayPart key={part.toolCallId} part={part} />
    case 'tool-show_timeline':
      return <TimelinePart key={part.toolCallId} part={part} />
    case 'tool-split_costs':
      return <SplitPart key={part.toolCallId} part={part} />
    case 'tool-compare_times':
      return <TimeZonesPart key={part.toolCallId} part={part} />
    case 'tool-start_timer':
      return <TimerPart key={part.toolCallId} part={part} />
    case 'tool-find_products':
      return <ProductsPart key={part.toolCallId} part={part} />
    case 'tool-add_to_cart':
    case 'tool-show_cart':
      return <CartPart key={part.toolCallId} part={part} />
    case 'tool-watch_price':
      return <WatchPart key={part.toolCallId} part={part} />
    case 'tool-get_news':
      return <NewsPart key={part.toolCallId} part={part} />
    case 'tool-setup_news':
      return <NewsSetupPart key={part.toolCallId} part={part} />
    case 'tool-write_page':
      return <PagePart key={part.toolCallId} part={part} />
    case 'tool-keep_page_updated':
      return <KeepUpdatedPart key={part.toolCallId} part={part} />
    case 'tool-call_phone':
      return (
        <CallPhonePart key={part.toolCallId} part={part} stopped={stopped} />
      )
    case 'tool-set_reminder':
      return <ReminderPart key={part.toolCallId} part={part} />
    case 'tool-run_plan':
      return <RunPlanPart key={part.toolCallId} part={part} />
    case 'tool-show_chart':
      return (
        <React.Suspense key={part.toolCallId}>
          <ChartPart part={part} />
        </React.Suspense>
      )
    case 'tool-problem_check':
      return <ProblemCheckPart key={part.toolCallId} part={part} />
    case 'tool-decide':
      return <DecidePart key={part.toolCallId} part={part} />
    case 'tool-preview_post':
      return <PostPreviewPart key={part.toolCallId} part={part} />
    case 'tool-preview_posts':
      return <PostPreviewsPart key={part.toolCallId} part={part} />
    case 'tool-generate_image':
      return <ImagePart key={part.toolCallId} part={part} />
    case 'tool-show_commands':
      return <CommandsPart key={part.toolCallId} part={part} onSend={onSend} />
    case 'tool-make_study_set':
      return <StudyPart key={part.toolCallId} part={part} />
    case 'tool-generate_video':
      return <VideoPart key={part.toolCallId} part={part} />
    default:
      return null
  }
}

/**
 * One card that can't render, like a saved result that no longer matches its
 * tool, shows a note instead of taking the whole chat down.
 */
class PartBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? (
      <p role="status" className="px-1.5 text-sm text-muted-foreground">
        This card couldn’t be shown.
      </p>
    ) : (
      this.props.children
    )
  }
}
