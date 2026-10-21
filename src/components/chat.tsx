import * as React from 'react'
import { useUIMessages } from '@convex-dev/agent/react'
import { Link } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { PanelRightIcon, PhoneIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { BUILT_IN_COMMANDS } from '../../convex/lib/commands'
import type { Effort } from '../../convex/lib/models'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import type { ChatUIMessage } from '~/components/chat-message'
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
import { getCallVolume } from '~/hooks/use-call-settings'
import { toWav } from '~/lib/wav'
import { CommandDialog } from '~/components/command-dialog'

/**
 * The one chat with one of the project's assistants: `bot`, or the lead when
 * unset. The first message starts it.
 */
export function Chat({
  project,
  bot,
  panel,
  onCall,
}: {
  project: Doc<'projects'>
  bot?: Doc<'bots'>
  /** Whether the right sidebar is open. It lives in the URL as `?panel=true`. */
  panel?: boolean
  /** Starts a voice call with this chat's assistant. */
  onCall: () => void
}) {
  const sendMessage = useMutation(api.api.chat.sendMessage)
  const commands = useQuery(api.api.commands.list, { projectId: project._id })
  const threadId =
    useQuery(api.api.threads.main, {
      projectId: project._id,
      botId: bot?._id,
    }) ?? undefined
  const thread = useQuery(api.api.threads.get, threadId ? { threadId } : 'skip')
  const emails = useQuery(
    api.api.emails.forThread,
    threadId ? { threadId } : 'skip',
  )
  const clips = useQuery(
    api.api.voiceClips.forThread,
    threadId ? { threadId } : 'skip',
  )
  const voiceUploadUrl = useMutation(api.api.chat.voiceUploadUrl)
  const sendVoiceNote = useAction(api.api.voiceClips.send)
  /** Sends a voice note as WAV and plays the spoken reply. Returns an error to show, if any. */
  async function voiceNote(recording: Blob) {
    try {
      const audio = await toWav(recording)
      const res = await fetch(await voiceUploadUrl(), {
        method: 'POST',
        headers: { 'Content-Type': audio.type },
        body: audio,
      })
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> }
      const { replyUrl } = await sendVoiceNote({
        projectId: project._id,
        botId: bot?._id,
        storageId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if (replyUrl) {
        const reply = new Audio(replyUrl)
        reply.volume = Math.min(getCallVolume(), 1)
        void reply.play().catch(() => undefined)
      }
      return undefined
    } catch (e) {
      return errorMessage(e, 'Could not send the voice note. Try again.')
    }
  }
  // A new chat's model, until the first message starts the thread.
  const [startModel, setStartModel] = React.useState<string>()
  const [startEffort, setStartEffort] = React.useState<Effort>()
  const [creatingCommand, setCreatingCommand] = React.useState(false)
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
        await sendMessage({
          projectId: project._id,
          botId: bot?._id,
          prompt,
          model: threadId ? undefined : startModel,
          effort: threadId ? undefined : startEffort,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
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
          {threadId && (
            <ThreadMembers project={project} bot={bot} threadId={threadId} />
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Call ${lead}`}
              title={`Call ${lead}`}
              onClick={onCall}
            >
              <PhoneIcon />
            </Button>
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
                    React.startTransition(() => send(prompt))
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
                          scrollAnchor={message.role === 'user'}
                        >
                          <ChatMessage message={message} />
                          {clips?.some((c) => c.messageId === message.id) && (
                            <audio
                              controls
                              preload="none"
                              aria-label={
                                message.role === 'user'
                                  ? 'Your voice note'
                                  : `${lead}'s spoken reply`
                              }
                              src={
                                clips.find((c) => c.messageId === message.id)
                                  ?.url ?? undefined
                              }
                              className={`mt-1 h-9 max-w-xs ${message.role === 'user' ? 'ml-auto' : 'ml-1.5'}`}
                            />
                          )}
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
          <PromptForm
            placeholder={`Message ${lead}…`}
            isBusy={isBusy}
            onSubmit={send}
            commands={[
              ...BUILT_IN_COMMANDS.filter(
                (b) => !commands?.some((c) => c.name === b.name),
              ).map((b) => ({ ...b, builtIn: true })),
              ...(commands ?? []),
            ]}
            onCreateCommand={() => setCreatingCommand(true)}
            onVoiceNote={voiceNote}
            tools={
              <>
                <EffortMenu
                  threadId={threadId}
                  effort={threadId ? thread?.effort : startEffort}
                  own={bot ? bot.effort : project.effort}
                  onPick={setStartEffort}
                />
                <ModelMenu
                  threadId={threadId}
                  model={threadId ? thread?.model : startModel}
                  own={bot ? bot.model : project.model}
                  onPick={setStartModel}
                />
              </>
            }
          />
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
