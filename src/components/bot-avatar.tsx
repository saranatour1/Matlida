import * as React from 'react'
import { cn } from 'cn'
import { PORTRAITS } from '../../convex/lib/portraits'
import type { Portrait } from '../../convex/lib/portraits'

/** An assistant's portrait, or a stable one from its name. Matilda gets hers. */
export function portraitOf(a: { portrait?: Portrait; name: string }): Portrait {
  if (a.portrait) return a.portrait
  if (a.name === 'Matilda') return 'matilda'
  let hash = 0
  for (const char of a.name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PORTRAITS[hash % PORTRAITS.length]
}

/** A random portrait, for a new assistant. */
export function randomPortrait(): Portrait {
  return PORTRAITS[Math.floor(Math.random() * PORTRAITS.length)]
}

export function BotAvatar({
  portrait,
  className,
}: {
  portrait: Portrait
  className?: string
}) {
  return (
    <img
      src={`/avatars/${portrait}.jpg`}
      alt=""
      aria-hidden
      draggable={false}
      className={cn(
        'inline-block size-4 shrink-0 rounded-[24%] bg-[#1c1c1c] object-cover',
        className,
      )}
    />
  )
}

/**
 * A big preview beside the portraits to pick from. `children` (name fields,
 * say) sit under the preview. Submits as the `portrait` form field.
 */
export function PortraitPicker({
  defaultValue,
  children,
}: {
  defaultValue: Portrait
  children?: React.ReactNode
}) {
  const [portrait, setPortrait] = React.useState(defaultValue)
  return (
    <div className="grid gap-6 sm:grid-cols-[11rem_1fr] sm:items-start">
      <input type="hidden" name="portrait" value={portrait} />
      <div className="flex flex-col items-center gap-3">
        <BotAvatar portrait={portrait} className="size-28 shadow-lg" />
        {children}
      </div>
      <div
        role="radiogroup"
        aria-label="Portrait"
        className="grid grid-cols-6 gap-1.5"
      >
        {PORTRAITS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={portrait === p}
            aria-label={p}
            title={p}
            onClick={() => setPortrait(p)}
            className="rounded-[28%] outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring aria-checked:ring-2 aria-checked:ring-foreground"
          >
            <BotAvatar portrait={p} className="size-11" />
          </button>
        ))}
      </div>
    </div>
  )
}

/** The `portrait` field a `PortraitPicker` submitted. The server validates it. */
export function portraitFromForm(data: FormData) {
  return String(data.get('portrait')) as Portrait
}
