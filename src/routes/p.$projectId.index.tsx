import { createFileRoute } from '@tanstack/react-router'
import { Chat } from '~/components/chat'

export const Route = createFileRoute('/p/$projectId/')({
  validateSearch: (search: Record<string, unknown>): { thread?: string } => ({
    thread: typeof search.thread === 'string' ? search.thread : undefined,
  }),
  component: ProjectChat,
})

function ProjectChat() {
  const { thread } = Route.useSearch()
  return <Chat threadId={thread} />
}
