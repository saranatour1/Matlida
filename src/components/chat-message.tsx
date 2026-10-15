import type { UIDataTypes } from 'ai'
import type { UIMessage } from '@convex-dev/agent/react'
import { ArtifactPart } from '~/components/parts/artifact-part'
import { EmployeePart } from '~/components/parts/employee-part'
import { TextPart } from '~/components/parts/text-part'
import { Bubble, BubbleContent } from '~/components/ui/bubble'
import { Message, MessageContent } from '~/components/ui/message'

/** Mirrors the lead's tools in `convex/models/threads/lead.ts`. */
export type ChatUIMessage = UIMessage<
  unknown,
  UIDataTypes,
  {
    ask_employee: {
      input: { employee: string; question: string }
      output: { name: string; role: string; reply: string }
    }
    save_artifact: {
      input: { title: string; content: string }
      output: { id: string; title: string }
    }
  }
>

export type AskEmployeePart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-ask_employee' }
>

export type SaveArtifactPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-save_artifact' }
>

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
              return <TextPart key={index} text={part.text} />
            case 'tool-ask_employee':
              return <EmployeePart key={part.toolCallId} part={part} />
            case 'tool-save_artifact':
              return <ArtifactPart key={part.toolCallId} part={part} />
            default:
              return null
          }
        })}
      </MessageContent>
    </Message>
  )
}
