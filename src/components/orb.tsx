import { cn } from 'cn'
import { AVATARS } from '../../convex/lib/avatars'
import type { Avatar } from '../../convex/lib/avatars'

/** Three stops per orb: highlight, body, shadow. */
const PALETTES: Record<Avatar, [string, string, string]> = {
  aurora: ['#a7f3d0', '#6366f1', '#1e1b4b'],
  ember: ['#fde68a', '#f97316', '#7c2d12'],
  tide: ['#a5f3fc', '#0ea5e9', '#0c4a6e'],
  moss: ['#d9f99d', '#16a34a', '#14532d'],
  dusk: ['#fbcfe8', '#a855f7', '#3b0764'],
  sol: ['#fef9c3', '#eab308', '#713f12'],
  frost: ['#f1f5f9', '#94a3b8', '#1e293b'],
  plum: ['#f5d0fe', '#c026d3', '#4a044e'],
  coral: ['#fecdd3', '#f43f5e', '#4c0519'],
  ink: ['#e5e5e5', '#404040', '#0a0a0a'],
  sand: ['#fef3c7', '#d6a35c', '#57381c'],
  iris: ['#c7d2fe', '#4f46e5', '#172554'],
}

/** A stable orb for an assistant that hasn't picked one. */
export function defaultAvatar(name: string): Avatar {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATARS[hash % AVATARS.length]
}

export function Orb({
  avatar,
  className,
}: {
  avatar: Avatar
  className?: string
}) {
  const [light, body, shadow] = PALETTES[avatar]
  return (
    <span
      aria-hidden
      className={cn('inline-block size-4 shrink-0 rounded-full', className)}
      style={{
        background: `radial-gradient(circle at 30% 28%, ${light} 0%, ${body} 45%, ${shadow} 100%)`,
        boxShadow: `inset 0 -2px 6px ${shadow}66`,
      }}
    />
  )
}

/** Radio buttons for the preset orbs. Submits as the `avatar` form field. */
export function AvatarPicker({ value }: { value: Avatar }) {
  return (
    <fieldset className="flex flex-col gap-1.5 text-sm">
      <legend className="mb-1.5">Look</legend>
      <div className="flex flex-wrap gap-2">
        {AVATARS.map((a) => (
          <label key={a} title={a} className="cursor-pointer">
            <input
              type="radio"
              name="avatar"
              value={a}
              defaultChecked={a === value}
              className="peer sr-only"
            />
            <Orb
              avatar={a}
              className="size-9 ring-offset-2 ring-offset-background peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
            />
          </label>
        ))}
      </div>
    </fieldset>
  )
}
