import * as React from 'react'
import { cn } from 'cn'
import { COLORS, SHAPES } from '../../convex/lib/looks'
import type { Color, Look, Shape } from '../../convex/lib/looks'

type Outline = Array<readonly [number, number]>

/** An outline from a radius at each angle. */
const polar = (radius: (angle: number) => number): Outline =>
  Array.from({ length: 180 }, (_, i) => {
    const t = (i / 180) * 2 * Math.PI
    const r = radius(t)
    return [r * Math.cos(t), r * Math.sin(t)] as const
  })

/** A convex polygon through `vertices` (by increasing angle), each corner an arc of radius `round`. */
const rounded = (vertices: Outline, round: number): Outline =>
  vertices.flatMap(([x, y], i) => {
    const [px, py] = vertices.at(i - 1) ?? vertices[0]
    const [nx, ny] = vertices[(i + 1) % vertices.length]
    const from = Math.atan2(y - py, x - px) - Math.PI / 2
    let to = Math.atan2(ny - y, nx - x) - Math.PI / 2
    while (to < from) to += 2 * Math.PI
    return Array.from({ length: 16 }, (_, j) => {
      const a = from + ((to - from) * j) / 15
      return [x + round * Math.cos(a), y + round * Math.sin(a)] as const
    })
  })

const regular = (n: number): Outline =>
  Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n
    return [Math.cos(a), Math.sin(a)] as const
  })

const OUTLINE: Record<Shape, Outline> = {
  round: polar(() => 1),
  squircle: polar(
    (t) => (Math.abs(Math.cos(t)) ** 4 + Math.abs(Math.sin(t)) ** 4) ** -0.25,
  ),
  pebble: polar((t) => 1 + 0.07 * Math.cos(2 * t) + 0.05 * Math.cos(3 * t + 1)),
  trefoil: polar((t) => 1 + 0.2 * Math.cos(3 * t)),
  swirl: polar((t) => 1 + 0.22 * Math.cos(3 * t + 1.1 * Math.sin(3 * t))),
  clover: polar((t) => 1 + 0.16 * Math.cos(4 * t)),
  flower: polar((t) => 1 + 0.1 * Math.cos(6 * t)),
  star: polar((t) => 1 + 0.22 * Math.cos(5 * t)),
  burst: polar((t) => 1 + 0.07 * Math.cos(10 * t)),
  diamond: rounded(regular(4), 0.3),
  hexagon: rounded(regular(6), 0.25),
  triangle: rounded(regular(3), 0.35),
  kite: rounded(
    [
      [1.3, 0],
      [0, 0.8],
      [-0.7, 0],
      [0, -0.8],
    ],
    0.3,
  ),
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

/** `hex` moved toward white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16)
  const target = amount > 0 ? 255 : 0
  const channel = (v: number) => Math.round(v + (target - v) * Math.abs(amount))
  return `rgb(${channel(n >> 16)} ${channel((n >> 8) & 255)} ${channel(n & 255)})`
}

/** Each color's light, body and deep stops, for the gradient. */
const STOPS = Object.fromEntries(
  COLORS.map((c) => [c, [shade(HEX[c], 0.45), HEX[c], shade(HEX[c], -0.25)]]),
) as Record<Color, [string, string, string]>

/** Bodies too light for a white sparkle. */
const LIGHT = new Set<Color>(['white', 'gold'])

/** The outline of every shape, tilted, then fitted into a 100×100 box with a margin. */
const PATHS = Object.fromEntries(
  SHAPES.map((shape) => {
    const tilt = (TILT[shape] * Math.PI) / 180
    const [cos, sin] = [Math.cos(tilt), Math.sin(tilt)]
    const points = OUTLINE[shape].map(
      ([x, y]) => [x * cos - y * sin, x * sin + y * cos] as const,
    )
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

/** A four-point sparkle, a little up and right of center. */
const SPARKLE =
  'M61 29Q62.6 37.4 71 39Q62.6 40.6 61 49Q59.4 40.6 51 39Q59.4 37.4 61 29Z'

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

/** An assistant as a glossy body: a gradient, a curved reflection and a sparkle. */
export function BotAvatar({
  look,
  className,
}: {
  look: Look
  className?: string
}) {
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, '')
  const [light, body, deep] = STOPS[look.color]
  const d = PATHS[look.shape]
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={cn('inline-block size-4 shrink-0', className)}
    >
      <defs>
        <linearGradient id={`${id}fill`} x1="0.2" y1="0.05" x2="0.8" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.5" stopColor={body} />
          <stop offset="1" stopColor={deep} />
        </linearGradient>
        <clipPath id={`${id}clip`}>
          <path d={d} />
        </clipPath>
      </defs>
      <path d={d} fill={`url(#${id}fill)`} />
      <g clipPath={`url(#${id}clip)`}>
        <ellipse
          cx="34"
          cy="27"
          rx="28"
          ry="13"
          transform="rotate(-28 34 27)"
          fill="#fff"
          opacity="0.32"
        />
      </g>
      <path
        d={SPARKLE}
        fill={LIGHT.has(look.color) ? '#000' : '#fff'}
        opacity={LIGHT.has(look.color) ? 0.35 : 0.9}
      />
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
