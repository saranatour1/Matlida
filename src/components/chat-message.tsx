import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { UIMessage } from '@convex-dev/agent/react'
import type { UIDataTypes } from 'ai'
import { BotPart } from '~/components/bot-part'
import { ReminderPart, ToolPart } from '~/components/tool-part'
import { Bubble, BubbleContent } from '~/components/ui/bubble'
import { Message, MessageContent } from '~/components/ui/message'

/** Mirrors the assistants' tools in `convex/models/threads/lead.ts` and `tools.ts`. */
export type ChatUIMessage = UIMessage<
  unknown,
  UIDataTypes,
  {
    ask_bot: {
      input: { bot: string; task: string }
      output: { name: string; role: string; reply: string; threadId: string }
    }
    web_search: { input: { query: string }; output: { answer: string } }
    research: { input: { question: string }; output: { report: string } }
    set_reminder: {
      input: { message: string; at: string; via: 'chat' | 'text' }
      output: { scheduled: boolean; at: string; via: 'chat' | 'text' }
    }
    save_plan: {
      input: { title: string; steps: Array<string>; planId?: string }
      output: { planId: string; saved: boolean }
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
            default:
              return null
          }
        })}
      </MessageContent>
    </Message>
  )
}
