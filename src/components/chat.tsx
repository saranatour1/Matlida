import * as React from 'react'
import { useUIMessages } from '@convex-dev/agent/react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { ChatMessage } from '~/components/chat-message'
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
import { errorMessage } from '~/lib/errors'

/** A chat with the project's lead. Without `threadId`, the first message starts one. */
export function Chat({
  project,
  threadId,
}: {
  project: Doc<'projects'>
  threadId?: string
}) {
  const navigate = useNavigate()
  const sendMessage = useMutation(api.api.chat.sendMessage)
  const lead = project.name
  const { results: messages } = useUIMessages(
    api.api.chat.listMessages,
    threadId ? { threadId } : 'skip',
    { initialNumItems: 50, stream: true },
  )
  const last = messages.at(-1)
  const isBusy =
    last?.role === 'user' ||
    last?.status === 'pending' ||
    last?.status === 'streaming'
  const isWaiting =
    isBusy &&
    !(
      last.role === 'assistant' &&
      last.parts.some((p) => p.type === 'text' && p.text.trim() !== '')
    )

  const [error, send] = React.useActionState(
    async (_previous: string | undefined, prompt: string) => {
      try {
        const id = await sendMessage({
          projectId: project._id,
          threadId,
          prompt,
        })
        if (!threadId) {
          void navigate({
            to: '/p/$projectId',
            params: { projectId: project._id },
            search: { thread: id },
          })
        }
        return undefined
      } catch (e) {
        return errorMessage(e, 'Could not send your message. Try again.')
      }
    },
    undefined,
  )

  return (
    <div className="mx-auto flex min-h-0 w-full flex-1 flex-col">
      {!threadId ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>What should {lead} work on?</EmptyTitle>
              <EmptyDescription>
                {project.brief || `Ask ${lead} anything.`}{' '}
                <Link to="/" search={{ edit: project._id }}>
                  Edit project
                </Link>
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Suggestions
                onSelect={(prompt) => React.startTransition(() => send(prompt))}
              />
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
                      {lead} is thinking…
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
        {(error || last?.status === 'failed') && (
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>
              {error ?? `${lead} couldn't finish that reply. Try again.`}
            </AlertDescription>
          </Alert>
        )}
        <PromptForm
          placeholder={`Message ${lead}…`}
          isBusy={isBusy}
          onSubmit={send}
        />
      </div>
    </div>
  )
}
