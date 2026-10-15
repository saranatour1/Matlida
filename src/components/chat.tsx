import * as React from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useUIMessages } from '@convex-dev/agent/react'
import { api } from '../../convex/_generated/api'
import { useProject } from '~/hooks/use-project'
import { errorMessage } from '~/lib/errors'
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
  const sendMessage = useMutation(api.chat.sendMessage)
  const project = useProject()
  const lead = project?.name ?? 'The lead'
  const team = useQuery(
    api.employees.list,
    project ? { projectId: project._id } : 'skip',
  )

  const { results } = useUIMessages(
    api.chat.listMessages,
    threadId && project ? { threadId } : 'skip',
    { initialNumItems: 50, stream: true },
  )
  const messages = results as ChatUIMessage[]
  const lastMessage = messages.at(-1)

  const isBusy =
    lastMessage?.role === 'user' ||
    lastMessage?.status === 'pending' ||
    lastMessage?.status === 'streaming'
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

  const [error, send] = React.useActionState(
    async (_previous: string | undefined, prompt: string) => {
      if (!project) return undefined
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

  if (project === null) {
    return (
      <p className="p-6 text-sm text-muted-foreground">Project not found.</p>
    )
  }
  return (
    <div className="mx-auto flex min-h-0 w-full flex-1 flex-col">
      {!threadId ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>What should the team work on?</EmptyTitle>
              <EmptyDescription>
                {!project || !team ? null : team.length ? (
                  <>
                    {lead} brings in {team.map((e) => e.name).join(', ')} as
                    needed, then gives you one answer.
                  </>
                ) : (
                  <>
                    {lead} has no employees yet.{' '}
                    <Link
                      to="/p/$projectId/team"
                      params={{ projectId: project._id }}
                    >
                      Add some
                    </Link>{' '}
                    so they can delegate.
                  </>
                )}
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
        {(error || lastMessage?.status === 'failed') && (
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>
              {error ?? `${lead} could not finish that reply. Try again.`}
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
