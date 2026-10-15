import * as React from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { useUIMessages } from '@convex-dev/agent/react'
import { api } from '../../convex/_generated/api'
import { ChatMessage, type ChatUIMessage } from '~/components/chat-message'
import { PromptForm } from '~/components/prompt-form'
import { Suggestions } from '~/components/suggestions'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '~/components/ui/empty'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '~/components/ui/message-scroller'

export function Chat({ threadId }: { threadId?: string }) {
  const navigate = useNavigate()
  const send = useMutation(api.matilda.sendMessage)
  const team = useQuery(api.employees.list)
  const [error, setError] = React.useState<string>()

  const { results } = useUIMessages(
    api.matilda.listMessages,
    threadId ? { threadId } : 'skip',
    { initialNumItems: 50, stream: true },
  )
  const messages = results as ChatUIMessage[]
  const lastMessage = messages.at(-1)

  const isBusy =
    lastMessage?.role === 'user' ||
    lastMessage?.status === 'pending' ||
    lastMessage?.status === 'streaming'
  // Busy, but nothing of Matilda's reply is on screen yet.
  const isWaiting =
    isBusy &&
    !(
      lastMessage?.role === 'assistant' &&
      lastMessage.parts.some(
        (p) =>
          (p.type === 'text' && p.text.trim() !== '') ||
          p.type.startsWith('tool-'),
      )
    )

  async function sendMessage(prompt: string) {
    setError(undefined)
    try {
      const id = await send({ threadId, prompt })
      if (!threadId) void navigate({ to: '/', search: { thread: id } })
    } catch (e) {
      setError(
        e instanceof ConvexError
          ? String(e.data)
          : 'Could not send your message. Please try again.',
      )
    }
  }

  return (
    <div className="mx-auto flex min-h-0 w-full flex-1 flex-col">
      {!threadId ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>What should the team work on?</EmptyTitle>
              <EmptyDescription>
                {team === undefined ? null : team.length ? (
                  <>
                    Matilda brings in {team.map((e) => e.name).join(', ')} as
                    needed, then gives you one answer.
                  </>
                ) : (
                  <>
                    Matilda has no employees yet.{' '}
                    <Link to="/team">Add some</Link> so she can delegate.
                  </>
                )}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Suggestions onSelect={sendMessage} />
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <MessageScrollerProvider>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
                {messages.map((message) => (
                  <MessageScrollerItem
                    key={message.key}
                    messageId={message.key}
                    scrollAnchor={message.role === 'user'}
                  >
                    <ChatMessage message={message} />
                  </MessageScrollerItem>
                ))}
                {isWaiting && (
                  <MessageScrollerItem messageId="thinking">
                    <div className="flex shimmer items-center gap-2 px-3 text-sm text-muted-foreground">
                      Matilda is thinking…
                    </div>
                  </MessageScrollerItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      )}

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-6 pb-6">
        {(error || lastMessage?.status === 'failed') && (
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>
              {error ?? 'Matilda could not finish that reply. Try again.'}
            </AlertDescription>
          </Alert>
        )}
        <PromptForm isBusy={isBusy} onSubmit={sendMessage} />
      </div>
    </div>
  )
}
