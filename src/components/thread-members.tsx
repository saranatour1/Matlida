import { useMutation, useQuery } from 'convex/react'
import { UserPlusIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { BotAvatar, portraitOf } from '~/components/bot-avatar'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'

/**
 * Who the chat's assistant can hand work to, for the chat's header. Without a
 * saved list, the lead works with every bot and a bot works alone.
 */
export function ThreadMembers({
  project,
  bot,
  threadId,
}: {
  project: Doc<'projects'>
  bot?: Doc<'bots'>
  threadId: string
}) {
  const thread = useQuery(api.api.threads.get, { threadId })
  const bots = useQuery(api.api.bots.list, { projectId: project._id })
  const setMembers = useMutation(api.api.threads.setMembers)
  if (!thread || !bots) return null
  const others = bots.filter((b) => b._id !== bot?._id)
  const memberIds = thread.memberIds ?? (bot ? [] : others.map((b) => b._id))
  const members = others.filter((b) => memberIds.includes(b._id))

  return (
    // On phones only the avatars and button show, so the chat's name keeps the room.
    <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:min-w-0 sm:shrink">
      {members.length > 0 && (
        <>
          <span className="flex -space-x-1">
            {members.map((m) => (
              <BotAvatar
                key={m._id}
                portrait={portraitOf(m)}
                className="size-5 ring-2 ring-background"
              />
            ))}
          </span>
          <span className="hidden truncate sm:inline">
            with {members.map((m) => m.name).join(', ')}
          </span>
        </>
      )}
      {others.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label="Members"
            title="Add or remove members"
          >
            <UserPlusIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Members</DropdownMenuLabel>
              {others.map((b) => (
                <DropdownMenuCheckboxItem
                  key={b._id}
                  checked={memberIds.includes(b._id)}
                  onCheckedChange={(checked) =>
                    void setMembers({
                      threadId,
                      memberIds: checked
                        ? [...memberIds, b._id]
                        : memberIds.filter((id) => id !== b._id),
                    })
                  }
                >
                  <BotAvatar portrait={portraitOf(b)} />
                  {b.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
