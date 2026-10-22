import { useNavigate } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { AlarmClockIcon, PhoneIcon, PhoneOffIcon } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { BotAvatar, portraitOf } from '~/components/bot-avatar'
import { Button } from '~/components/ui/button'
import { useCall } from '~/components/voice-call'

/**
 * Rings when an assistant calls you with a reminder, on any page, unless
 * you're already on a call. Answering opens the chat it was set in, with the
 * call under the message box and the assistant speaking first. Snooze rings
 * again in 10 minutes.
 */
export function IncomingCall() {
  const { call, startCall } = useCall()
  // Nothing rings over a call, so there's nothing to ask about during one.
  const rings = useQuery(
    api.api.reminders.ringing,
    call.status === 'idle' ? {} : 'skip',
  )
  const answer = useAction(api.api.calls.answer)
  const decline = useMutation(api.api.reminders.decline)
  const snooze = useMutation(api.api.reminders.snooze)
  const navigate = useNavigate()
  const ring = rings?.[0]
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
        <p className="text-xs text-muted-foreground">
          {ring.checkIn
            ? 'Calling to check in'
            : ring.again
              ? 'Calling again'
              : 'Calling with a reminder'}
        </p>
      </div>
      <Button
        variant="outline"
        className="size-10 rounded-full"
        aria-label="Snooze 10 minutes"
        title="Snooze 10 minutes"
        onClick={() => void snooze({ id: ring._id })}
      >
        <AlarmClockIcon />
      </Button>
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
          startCall(
            {
              projectId: ring.projectId,
              botId: ring.botId,
              threadId: ring.threadId,
            },
            { name: ring.from, portrait },
            answer({ id: ring._id }),
          )
          void navigate({
            to: '/p/$projectId',
            params: { projectId: ring.projectId },
            search: { bot: ring.botId },
          })
        }}
      >
        <PhoneIcon />
      </Button>
    </div>
  )
}
