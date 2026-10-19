import * as React from 'react'
import { cn } from 'cn'
import { COLORS, SHAPES } from '../../convex/lib/looks'
import type { Color, Look, Shape } from '../../convex/lib/looks'

/** A shape's outline as a radius for each angle, before it's scaled to fit. */
type Radius = (angle: number) => number

/** A polygon with `n` sides, its corners rounded by blending toward a circle. */
const polygon =
  (n: number, round: number): Radius =>
  (t) => {
    const side = (2 * Math.PI) / n
    const a = (((t % side) + side) % side) - side / 2
    return (Math.cos(Math.PI / n) / Math.cos(a)) * (1 - round) + round
  }

const RADIUS: Record<Shape, Radius> = {
  round: () => 1,
  squircle: (t) =>
    (Math.abs(Math.cos(t)) ** 4 + Math.abs(Math.sin(t)) ** 4) ** -0.25,
  pebble: (t) => 1 + 0.07 * Math.cos(2 * t) + 0.05 * Math.cos(3 * t + 1),
  trefoil: (t) => 1 + 0.2 * Math.cos(3 * t),
  swirl: (t) => 1 + 0.2 * Math.cos(3 * t + 0.6 * Math.sin(3 * t)),
  clover: (t) => 1 + 0.16 * Math.cos(4 * t),
  flower: (t) => 1 + 0.1 * Math.cos(6 * t),
  star: (t) => 1 + 0.22 * Math.cos(5 * t),
  burst: (t) => 1 + 0.07 * Math.cos(10 * t),
  diamond: polygon(4, 0.4),
  hexagon: polygon(6, 0.35),
  triangle: polygon(3, 0.5),
  kite: (t) => polygon(4, 0.3)(t) * (1 + 0.22 * Math.cos(t)),
}

/** Each shape leans a little, so the set reads as characters, not icons. */
const TILT: Record<Shape, number> = {
  round: 0,
  squircle: -8,
  pebble: 10,
  trefoil: -90,
  swirl: -90,
  clover: 12,
  flower: -6,
  star: -90,
  burst: 8,
  diamond: 0,
  hexagon: 10,
  triangle: -90,
  kite: 45,
}

const HEX: Record<Color, string> = {
  white: '#f5f5f4',
  sand: '#c8946a',
  red: '#ee342f',
  orange: '#f97316',
  gold: '#f3b01c',
  green: '#22c55e',
  teal: '#14b8a6',
  blue: '#3b82f6',
  plum: '#8d2676',
  pink: '#ec4899',
  gray: '#8a8a8a',
}

/** Bodies dark enough that the face needs to be light. */
const DARK = new Set<Color>(['plum', 'blue'])

/** The outline of every shape, fitted into a 100×100 box with a margin. */
const PATHS = Object.fromEntries(
  SHAPES.map((shape) => {
    const points = Array.from({ length: 180 }, (_, i) => {
      const t = (i / 180) * 2 * Math.PI
      const r = RADIUS[shape](t)
      return [r * Math.cos(t), r * Math.sin(t)] as const
    })
    const xs = points.map(([x]) => x)
    const ys = points.map(([, y]) => y)
    const [minX, maxX, minY, maxY] = [
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...ys),
      Math.max(...ys),
    ]
    const scale = 84 / Math.max(maxX - minX, maxY - minY)
    const dx = 50 - ((minX + maxX) / 2) * scale
    const dy = 50 - ((minY + maxY) / 2) * scale
    const d = points
      .map(
        ([x, y], i) =>
          `${i ? 'L' : 'M'}${(x * scale + dx).toFixed(2)} ${(y * scale + dy).toFixed(2)}`,
      )
      .join('')
    return [shape, `${d}Z`]
  }),
) as Record<Shape, string>

/** A stable look for an assistant that hasn't picked one. */
export function defaultLook(name: string): Look {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return {
    shape: SHAPES[hash % SHAPES.length],
    color: COLORS[(hash >>> 8) % COLORS.length],
  }
}

/** An assistant's look, or its default. */
export const lookOf = (a: { look?: Look; name: string }) =>
  a.look ?? defaultLook(a.name)

export function BotAvatar({
  look,
  className,
}: {
  look: Look
  className?: string
}) {
  // Only the body leans; the face keeps the logo's diagonal on every shape.
  const tilt = TILT[look.shape]
  const face = DARK.has(look.color) ? '#fafafa' : '#0a0a0a'
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={cn('inline-block size-4 shrink-0', className)}
    >
      <path
        d={PATHS[look.shape]}
        fill={HEX[look.color]}
        transform={`rotate(${tilt} 50 50)`}
      />
      <g fill={face}>
        <circle cx="39" cy="39" r="6" />
        <circle cx="50" cy="50" r="6" />
        <circle cx="61" cy="61" r="6" />
      </g>
    </svg>
  )
}

/** A random look, for a new assistant. */
export function randomLook(): Look {
  const pick = <T,>(list: ReadonlyArray<T>) =>
    list[Math.floor(Math.random() * list.length)]
  return { shape: pick(SHAPES), color: pick(COLORS) }
}

/**
 * A big preview beside the shapes and colors to pick from. `children` (name
 * fields, say) sit under the preview. Submits as the `shape` and `color`
 * form fields.
 */
export function LookPicker({
  defaultValue,
  children,
}: {
  defaultValue: Look
  children?: React.ReactNode
}) {
  const [look, setLook] = React.useState(defaultValue)
  return (
    <div className="grid gap-6 sm:grid-cols-[11rem_1fr] sm:items-start">
      <input type="hidden" name="shape" value={look.shape} />
      <input type="hidden" name="color" value={look.color} />
      <div className="flex flex-col items-center gap-3">
        <BotAvatar look={look} className="size-28 drop-shadow-lg" />
        {children}
      </div>
      <div className="flex flex-col gap-4">
        <div
          role="radiogroup"
          aria-label="Shape"
          className="flex flex-col gap-2"
        >
          <span className="text-xs text-muted-foreground">Shape</span>
          <div className="grid grid-cols-5 gap-1.5">
            {SHAPES.map((shape) => (
              <button
                key={shape}
                type="button"
                role="radio"
                aria-checked={look.shape === shape}
                aria-label={shape}
                title={shape}
                onClick={() => setLook({ ...look, shape })}
                className="grid place-items-center rounded-xl p-1.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-checked:bg-muted aria-checked:ring-1 aria-checked:ring-foreground/40"
              >
                <BotAvatar look={{ ...look, shape }} className="size-9" />
              </button>
            ))}
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label="Color"
          className="flex flex-col gap-2"
        >
          <span className="text-xs text-muted-foreground">Color</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={look.color === color}
                aria-label={color}
                title={color}
                onClick={() => setLook({ ...look, color })}
                className="size-6 rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring aria-checked:ring-2 aria-checked:ring-foreground"
                style={{ background: HEX[color] }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The `shape` and `color` fields a `LookPicker` submitted. The server validates them. */
export function lookFromForm(data: FormData): Look {
  return {
    shape: String(data.get('shape')) as Shape,
    color: String(data.get('color')) as Color,
  }
}
