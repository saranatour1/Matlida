import * as React from 'react'
import { useUIMessages } from '@convex-dev/agent/react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { PanelRightIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { BUILT_IN_COMMANDS } from '../../convex/lib/commands'
import type { Doc } from '../../convex/_generated/dataModel'
import type { ChatUIMessage } from '~/components/chat-message'
import type { Attachment } from '~/components/prompt-form'
import { AssistantPanel } from '~/components/assistant-panel'
import { BotAvatar, portraitOf } from '~/components/bot-avatar'
import { ChatMessage } from '~/components/chat-message'
import { EffortMenu } from '~/components/effort-menu'
import { EmailReply } from '~/components/email-reply'
import { ModelMenu } from '~/components/model-menu'
import { PromptForm } from '~/components/prompt-form'
import { Suggestions } from '~/components/suggestions'
import { ThreadMembers } from '~/components/thread-members'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { SidebarTrigger } from '~/components/ui/sidebar'
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
import { VoiceBar, useCall } from '~/components/voice-call'
import { CommandDialog } from '~/components/command-dialog'

/**
 * The one chat with one of the project's assistants: `bot`, or the lead when
 * unset. The first message starts it.
 */
export function Chat({
  project,
  bot,
  panel,
}: {
  project: Doc<'projects'>
  bot?: Doc<'bots'>
  /** Whether the right sidebar is open. It lives in the URL as `?panel=true`. */
  panel?: boolean
}) {
  const sendMessage = useMutation(api.api.chat.sendMessage)
  const redo = useMutation(api.api.chat.redo)
  const commands = useQuery(api.api.commands.list, { projectId: project._id })
  const threadId =
    useQuery(api.api.threads.main, {
      projectId: project._id,
      botId: bot?._id,
    }) ?? undefined
  const [creatingCommand, setCreatingCommand] = React.useState(false)
  const lead = bot?.name ?? project.name
  const { call, caller, startCall } = useCall()
  // Talking in this chat: the call is on, with this assistant.
  const talking =
    caller !== undefined &&
    caller.target.projectId === project._id &&
    caller.target.botId === bot?._id &&
    (call.status !== 'idle' || call.error !== undefined)
  const { results } = useUIMessages(
    api.api.chat.listMessages,
    threadId ? { threadId } : 'skip',
    { initialNumItems: 50, stream: true },
  )
  const messages = results as Array<ChatUIMessage>
  const emails = useQuery(
    api.api.emails.forMessages,
    threadId ? { threadId, messageIds: messages.map((m) => m.id) } : 'skip',
  )
  const last = messages.at(-1)
  const lastPrompt = messages.filter((m) => m.role === 'user').at(-1)
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
    async (
      _previous: string | undefined,
      input:
        | { prompt: string; files?: Array<Attachment> }
        /** Answer your message `redo` again, after replacing its text with `prompt` when set. */
        | { redo: string; prompt?: string },
    ) => {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      try {
        if (!('redo' in input)) {
          await sendMessage({
            projectId: project._id,
            botId: bot?._id,
            ...input,
            timeZone,
          })
        } else if (threadId) {
          await redo({
            threadId,
            messageId: input.redo,
            prompt: input.prompt,
            timeZone,
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
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <header className="@container flex items-center gap-2 px-4 py-3">
          <SidebarTrigger />
          <BotAvatar portrait={portraitOf(bot ?? project)} className="size-6" />
          <h1 className="truncate text-sm font-medium">{lead}</h1>
          <ThreadMembers project={project} bot={bot} />
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={panel ? 'Hide details' : 'Show details'}
              title={panel ? 'Hide details' : 'Show details'}
              aria-pressed={panel}
              render={
                <Link
                  to="."
                  search={(prev) => ({
                    ...prev,
                    panel: panel ? undefined : true,
                  })}
                />
              }
              nativeButton={false}
            >
              <PanelRightIcon />
            </Button>
          </div>
        </header>
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
                  onSelect={(prompt) =>
                    React.startTransition(() => send({ prompt }))
                  }
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
                          React.startTransition(() =>
                            send({ prompt: `/${c.name}` }),
                          )
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
            <MessageScrollerProvider>
              <MessageScroller className="flex-1">
                <MessageScrollerViewport>
                  <MessageScrollerContent className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
                    {messages.map((message) => {
                      const email = emails?.find(
                        (e) => e.chatMessageId === message.id,
                      )
                      return (
                        <MessageScrollerItem
                          key={message.key}
                          messageId={message.key}
                        >
                          <ChatMessage
                            message={message}
                            onSend={
                              isBusy
                                ? undefined
                                : (prompt) =>
                                    React.startTransition(() =>
                                      send({ prompt }),
                                    )
                            }
                            onEdit={
                              isBusy || message.role !== 'user'
                                ? undefined
                                : (prompt) =>
                                    React.startTransition(() =>
                                      send({ redo: message.id, prompt }),
                                    )
                            }
                            onRetry={
                              isBusy || message !== last || !lastPrompt
                                ? undefined
                                : () =>
                                    React.startTransition(() =>
                                      send({ redo: lastPrompt.id }),
                                    )
                            }
                          />
                          {email && (
                            <EmailReply
                              email={email}
                              className={
                                message.role === 'user' ? 'justify-end' : ''
                              }
                            />
                          )}
                        </MessageScrollerItem>
                      )
                    })}
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
          {talking ? (
            <VoiceBar />
          ) : (
            <PromptForm
              placeholder={`Message ${lead}…`}
              isBusy={isBusy}
              onSubmit={(prompt, files) => send({ prompt, files })}
              commands={[
                ...BUILT_IN_COMMANDS.filter(
                  (b) => !commands?.some((c) => c.name === b.name),
                ).map((b) => ({ ...b, builtIn: true })),
                ...(commands ?? []),
              ]}
              onCreateCommand={() => setCreatingCommand(true)}
              onTalk={() =>
                startCall(
                  { projectId: project._id, botId: bot?._id },
                  {
                    name: lead,
                    portrait: portraitOf(bot ?? project),
                  },
                )
              }
              tools={
                <>
                  <EffortMenu
                    projectId={project._id}
                    botId={bot?._id}
                    effort={bot ? bot.effort : project.effort}
                  />
                  <ModelMenu
                    projectId={project._id}
                    botId={bot?._id}
                    model={bot ? bot.model : project.model}
                  />
                </>
              }
            />
          )}
          {creatingCommand && (
            <CommandDialog
              projectId={project._id}
              onClose={() => setCreatingCommand(false)}
            />
          )}
        </div>
      </div>
      {panel && (
        <AssistantPanel project={project} bot={bot} threadId={threadId} />
      )}
    </div>
  )
}
