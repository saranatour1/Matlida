import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useUIMessages } from '@convex-dev/agent/react'
import { api } from '../../convex/_generated/api'
import { ChatMessage, type ChatUIMessage } from '~/components/chat-message'

export const Route = createFileRoute('/threads/$threadId')({
  component: ThreadPreview,
})

// Read-only view of one of Matilda's conversations with an employee.
function ThreadPreview() {
  const { threadId } = Route.useParams()
  const thread = useQuery(api.threads.get, { threadId })
  const { results } = useUIMessages(
    api.matilda.listMessages,
    { threadId },
    { initialNumItems: 50, stream: true },
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">{thread?.title ?? 'Thread'}</h1>
          {thread?.parentThreadId && (
            <Link
              to="/"
              search={{ thread: thread.parentThreadId }}
              className="text-sm text-muted-foreground underline hover:text-foreground"
            >
              Open the chat it came from
            </Link>
          )}
        </div>
        {(results as ChatUIMessage[]).map((message) => (
          <ChatMessage key={message.key} message={message} />
        ))}
      </div>
    </div>
  )
}
