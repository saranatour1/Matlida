import * as React from 'react'
import { useUIMessages } from '@convex-dev/agent/react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import type { ChatUIMessage } from '~/components/chat-message'
import { ChatMessage } from '~/components/chat-message'
import { PromptForm } from '~/components/prompt-form'
import { Suggestions } from '~/components/suggestions'
import { ThreadMembers } from '~/components/thread-members'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
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

/**
 * A chat with one of the project's assistants: `bot`, or the lead when unset.
 * Without `threadId`, the first message starts one.
 */
export function Chat({
  project,
  bot,
  threadId,
}: {
  project: Doc<'projects'>
  bot?: Doc<'bots'>
  threadId?: string
}) {
  const navigate = useNavigate()
  const sendMessage = useMutation(api.api.chat.sendMessage)
  const commands = useQuery(api.api.commands.list, { projectId: project._id })
  const lead = bot?.name ?? project.name
  const { results } = useUIMessages(
    api.api.chat.listMessages,
    threadId ? { threadId } : 'skip',
    { initialNumItems: 50, stream: true },
  )
  const messages = results as Array<ChatUIMessage>
  const last = messages.at(-1)
  const isBusy =
    last?.role === 'user' ||
    last?.status === 'pending' ||
    last?.status === 'streaming'
  const isWaiting =
    isBusy &&
    !(
      last.role === 'assistant' &&
      last.parts.some(
        (p) =>
          (p.type === 'text' && p.text.trim() !== '') ||
          p.type.startsWith('tool-'),
      )
    )

  const [error, send] = React.useActionState(
    async (_previous: string | undefined, prompt: string) => {
      try {
        const id = await sendMessage({
          projectId: project._id,
          botId: bot?._id,
          threadId,
          prompt,
        })
        if (!threadId) {
          void navigate({
            to: '/p/$projectId',
            params: { projectId: project._id },
            search: { thread: id, bot: bot?._id },
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
                {(bot ? bot.role : project.brief) || `Ask ${lead} anything.`}{' '}
                {bot ? (
                  <Link
                    to="/p/$projectId/bots"
                    params={{ projectId: project._id }}
                    search={{ edit: bot._id }}
                  >
                    Edit {bot.name}
                  </Link>
                ) : (
                  <Link
                    to="/p/$projectId/settings"
                    params={{ projectId: project._id }}
                  >
                    Settings
                  </Link>
                )}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Suggestions
                onSelect={(prompt) => React.startTransition(() => send(prompt))}
              />
              {!bot && commands && commands.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  {commands.map((c) => (
                    <Button
                      key={c._id}
                      variant="secondary"
                      size="sm"
                      title={c.description}
                      onClick={() =>
                        React.startTransition(() => send(`/${c.name}`))
                      }
                    >
                      /{c.name}
                    </Button>
                  ))}
                </div>
              )}
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <>
          <ThreadMembers project={project} bot={bot} threadId={threadId} />
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
        </>
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
