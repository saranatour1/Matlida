import { TimerIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'
import { useNowSeconds } from '~/hooks/use-now'

type TimerToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-start_timer' }
>
type Timer = Extract<TimerToolPart, { state: 'output-available' }>['output']

/** A focus timer counting down in the chat. It runs from when it was set, so a reload keeps time. */
export function TimerPart({ part }: { part: TimerToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={TimerIcon}>
        {failed ? `Couldn’t start the timer.` : 'Starting the timer…'}
      </ToolStatus>
    )
  }
  const timer = part.output
  // Only a running timer ticks; a finished one just says so.
  return timer.endsAt > Date.now() ? (
    <Countdown timer={timer} />
  ) : (
    <Face timer={timer} left={0} />
  )
}

function Countdown({ timer }: { timer: Timer }) {
  const now = useNowSeconds()
  return (
    <Face
      timer={timer}
      left={Math.max(0, Math.ceil(timer.endsAt / 1000) - now)}
    />
  )
}

const RADIUS = 26
const CIRCLE = 2 * Math.PI * RADIUS

function Face({ timer, left }: { timer: Timer; left: number }) {
  const total = timer.minutes * 60
  const done = left === 0
  return (
    <div className="mx-1.5 flex max-w-xs items-center gap-4 rounded-xl border bg-card p-4 text-sm text-card-foreground">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          className="fill-none stroke-muted"
          strokeWidth="6"
        />
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          className="fill-none stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={CIRCLE}
          strokeDashoffset={CIRCLE * (1 - left / total)}
        />
      </svg>
      <div className="flex flex-col">
        <p className="font-medium">{timer.label}</p>
        <p
          className="text-2xl tabular-nums"
          role="timer"
          aria-live={done ? 'polite' : 'off'}
        >
          {done
            ? 'Time’s up'
            : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
        </p>
        <p className="text-xs text-muted-foreground">{timer.minutes} minutes</p>
      </div>
    </div>
  )
}
