import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { UIMessage } from '@convex-dev/agent/react'
import { Bubble, BubbleContent } from '~/components/ui/bubble'
import { Message, MessageContent } from '~/components/ui/message'

/** One chat message. User messages are bubbles, the lead's replies are markdown. */
export function ChatMessage({ message }: { message: UIMessage }) {
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
        {message.parts.map((part, index) =>
          part.type === 'text' && part.text.trim() ? (
            <div key={index} className="typeset typeset-docs px-1.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {part.text}
              </ReactMarkdown>
            </div>
          ) : null,
        )}
      </MessageContent>
    </Message>
  )
}
