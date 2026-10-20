import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { UIMessage } from '@convex-dev/agent/react'
import type { InferUITools, UIDataTypes } from 'ai'
import type { assistantTools } from '../../convex/models/threads/tools'
import { BotPart } from '~/components/bot-part'
import { PostPreviewPart } from '~/components/post-preview-part'
import { RunPlanPart } from '~/components/task-card'
import { ReminderPart, ToolPart } from '~/components/tool-part'
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
      output: { name: string; role: string; reply: string; threadId: string }
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
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}

/** One chat message. User messages are bubbles, replies are markdown and tool cards. */
export function ChatMessage({ message }: { message: ChatUIMessage }) {
  if (message.role === 'user') {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble align="end" variant="muted">
            <BubbleContent>{message.text}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }
  return (
    <Message align="start">
      <MessageContent>
        {message.parts.map((part, index) => {
          switch (part.type) {
            case 'text':
              return part.text.trim() ? (
                <Markdown key={index} text={part.text} />
              ) : null
            case 'tool-ask_bot':
              return <BotPart key={part.toolCallId} part={part} />
            case 'tool-web_search':
            case 'tool-research':
            case 'tool-save_plan':
              return <ToolPart key={part.toolCallId} part={part} />
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
            case 'tool-preview_post':
              return <PostPreviewPart key={part.toolCallId} part={part} />
            default:
              return null
          }
        })}
      </MessageContent>
    </Message>
  )
}
