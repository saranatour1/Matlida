import { useUIMessages } from '@convex-dev/agent/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../../../../convex/_generated/api'
import type { ChatUIMessage } from '~/components/chat-message'
import { ChatMessage } from '~/components/chat-message'

export const Route = createFileRoute('/_app/p/$projectId/threads/$threadId')({
  component: Thread,
})

/** Read-only view of a sub-thread, where the lead handed work to a bot. */
function Thread() {
  const { projectId, threadId } = Route.useParams()
  const thread = useQuery(api.api.threads.get, { threadId })
  const { results } = useUIMessages(
    api.api.chat.listMessages,
    thread ? { threadId } : 'skip',
    { initialNumItems: 50, stream: true },
  )

  if (thread === null) {
    return (
      <p className="p-6 text-sm text-muted-foreground">Thread not found.</p>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">{thread?.title ?? 'Thread'}</h1>
          {thread?.parentThreadId && (
            <Link
              to="/p/$projectId"
              params={{ projectId }}
              search={{ thread: thread.parentThreadId }}
              className="text-sm text-muted-foreground underline hover:text-foreground"
            >
              Open the chat it came from
            </Link>
          )}
        </div>
        {(results as Array<ChatUIMessage>).map((message) => (
          <ChatMessage key={message.key} message={message} />
        ))}
      </div>
    </div>
  )
}
