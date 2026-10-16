import { Link } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'

import { Button } from '~/components/ui/button'

export function NewChatButton({ projectId }: { projectId: string }) {
  return (
    <Button
      variant="secondary"
      render={<Link to="/p/$projectId" params={{ projectId }} />}
      nativeButton={false}
    >
      <PlusIcon data-icon="inline-start" />
      New Chat
    </Button>
  )
}
