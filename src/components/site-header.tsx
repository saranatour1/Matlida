import { Link } from '@tanstack/react-router'

import { NewChatButton } from '~/components/new-chat-button'
import { SidebarTrigger } from '~/components/ui/sidebar'

export function SiteHeader() {
  return (
    <header className="flex items-center gap-2 px-4 py-3">
      <SidebarTrigger />
      <Link to="/" className="text-sm font-medium">
        Matilda
      </Link>
      <div className="ml-auto">
        <NewChatButton />
      </div>
    </header>
  )
}
