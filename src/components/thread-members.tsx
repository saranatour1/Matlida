import { useMutation, useQuery } from 'convex/react'
import { UserPlusIcon } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
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

/** Who the chat's assistant can hand work to, for the chat's header. None until you add them. */
export function ThreadMembers({
  project,
  bot,
}: {
  project: Doc<'projects'>
  bot?: Doc<'bots'>
}) {
  const bots = useQuery(api.api.bots.list, { projectId: project._id })
  const setMembers = useMutation(api.api.threads.setMembers)
  if (!bots) return null
  const others = bots.filter((b) => b._id !== bot?._id)
  const memberIds = (bot ?? project).memberIds ?? []
  const members = others.filter((b) => memberIds.includes(b._id))

  return (
    // The header's width decides what fits, so nothing spills onto Call: no
    // members below 20rem, avatars and the button from there, names from 42rem.
    <div className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground @xs:flex @2xl:min-w-0 @2xl:shrink">
      {members.length > 0 && (
        <>
          <span
            className="flex shrink-0 items-center -space-x-1"
            title={members.map((m) => m.name).join(', ')}
          >
            {members.slice(0, 3).map((m) => (
              <BotAvatar
                key={m._id}
                portrait={portraitOf(m)}
                className="size-5 ring-2 ring-background"
              />
            ))}
          </span>
          {members.length > 3 && (
            <span className="shrink-0 @2xl:hidden">+{members.length - 3}</span>
          )}
          <span className="hidden min-w-0 truncate @2xl:inline">
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
                      projectId: project._id,
                      botId: bot?._id,
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
