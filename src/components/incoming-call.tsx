import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { PhoneIcon, PhoneOffIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Portrait } from '../../convex/lib/portraits'
import { BotAvatar, portraitOf } from '~/components/bot-avatar'
import { Button } from '~/components/ui/button'
import { VoiceCallScreen, useVoiceCall } from '~/components/voice-call'

/**
 * Rings when an assistant calls you with a reminder, on any page. Answering
 * opens the chat it was set in and a call where the assistant speaks first.
 */
export function IncomingCall() {
  const rings = useQuery(api.api.reminders.ringing)
  const answer = useAction(api.api.calls.answer)
  const decline = useMutation(api.api.reminders.decline)
  const call = useVoiceCall()
  const navigate = useNavigate()
  // The ring is gone once answered, so the call screen keeps who called.
  const [caller, setCaller] = React.useState<{
    name: string
    portrait: Portrait
  }>()
  const ring = rings?.[0]
  if (call.status !== 'idle' && caller) {
    return (
      <VoiceCallScreen
        call={call}
        name={caller.name}
        portrait={caller.portrait}
      />
    )
  }
  if (!ring || call.status !== 'idle') return null
  const portrait = portraitOf({ portrait: ring.portrait, name: ring.from })
  return (
    <div
      role="alertdialog"
      aria-label={`${ring.from} is calling`}
      className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-2xl border bg-popover p-3 pr-4 text-popover-foreground shadow-lg"
    >
      <audio src="/ring.wav" autoPlay loop />
      <BotAvatar
        portrait={portrait}
        className="size-12 animate-pulse ring-2 ring-emerald-400/70"
      />
      <div className="mr-2">
        <p className="text-sm font-medium">{ring.from}</p>
        <p className="text-xs text-muted-foreground">Calling with a reminder</p>
      </div>
      <Button
        variant="destructive"
        className="size-10 rounded-full"
        aria-label="Decline"
        onClick={() => void decline({ id: ring._id })}
      >
        <PhoneOffIcon />
      </Button>
      <Button
        className="size-10 rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
        aria-label="Answer"
        onClick={() => {
          setCaller({ name: ring.from, portrait })
          void call.start(
            {
              projectId: ring.projectId,
              botId: ring.botId,
              threadId: ring.threadId,
            },
            answer({ id: ring._id }),
          )
          void navigate({
            to: '/p/$projectId',
            params: { projectId: ring.projectId },
            search: { thread: ring.threadId, bot: ring.botId },
          })
        }}
      >
        <PhoneIcon />
      </Button>
    </div>
  )
}
