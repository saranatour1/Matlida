import { createFileRoute } from '@tanstack/react-router'
import { Chat } from '~/components/chat'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { thread?: string } => ({
    thread: typeof search.thread === 'string' ? search.thread : undefined,
  }),
  component: Home,
})

function Home() {
  const { thread } = Route.useSearch()
  return <Chat threadId={thread} />
}
