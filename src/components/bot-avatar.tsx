import * as React from 'react'
import { cn } from 'cn'
import { COLORS, FIGURES, SHAPES } from '../../convex/lib/looks'
import type { Color, Figure, Look, Shape } from '../../convex/lib/looks'

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

/** Bodies dark enough that the face needs to be light. */
const DARK = new Set<Color>(['plum', 'blue'])

/**
 * The head outline of every shape, tilted, then fitted to fill the tile from
 * y=22 down past the bottom edge, so it crops like a portrait.
 */
const HEADS = Object.fromEntries(
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
    const scale = 88 / Math.max(maxX - minX, maxY - minY)
    const dx = 50 - ((minX + maxX) / 2) * scale
    const dy = 22 - minY * scale
    const d = points
      .map(
        ([x, y], i) =>
          `${i ? 'L' : 'M'}${(x * scale + dx).toFixed(2)} ${(y * scale + dy).toFixed(2)}`,
      )
      .join('')
    return [shape, `${d}Z`]
  }),
) as Record<Shape, string>

/** Which costume colors clash with which skins, so a red cap never sits on a red head. */
function pick(color: Color, main: string, alt: string, clash: Array<Color>) {
  return clash.includes(color) ? alt : main
}

const INK = '#1c1917'
const EAR_PINK = '#f9a8d4'

/** Costume layers drawn behind the head: ears, bumps, the hood. */
function Behind({ figure, color }: { figure: Figure; color: Color }) {
  const fur = shade(HEX[color], -0.18)
  switch (figure) {
    case 'cat':
      return (
        <>
          <path d="M8 50 L14 4 L42 26 Z" fill={fur} />
          <path d="M92 50 L86 4 L58 26 Z" fill={fur} />
          <path d="M15 40 L18 14 L34 28 Z" fill={EAR_PINK} />
          <path d="M85 40 L82 14 L66 28 Z" fill={EAR_PINK} />
        </>
      )
    case 'bear':
      return (
        <>
          <circle cx="20" cy="27" r="14" fill={fur} />
          <circle cx="80" cy="27" r="14" fill={fur} />
          <circle cx="21" cy="28" r="7" fill={EAR_PINK} />
          <circle cx="79" cy="28" r="7" fill={EAR_PINK} />
        </>
      )
    case 'bunny':
      return (
        <>
          <ellipse
            cx="33"
            cy="14"
            rx="9"
            ry="24"
            transform="rotate(-12 33 14)"
            fill={fur}
          />
          <ellipse
            cx="67"
            cy="14"
            rx="9"
            ry="24"
            transform="rotate(12 67 14)"
            fill={fur}
          />
          <ellipse
            cx="33"
            cy="16"
            rx="4"
            ry="16"
            transform="rotate(-12 33 16)"
            fill={EAR_PINK}
          />
          <ellipse
            cx="67"
            cy="16"
            rx="4"
            ry="16"
            transform="rotate(12 67 16)"
            fill={EAR_PINK}
          />
        </>
      )
    case 'frog':
      return (
        <>
          <circle cx="29" cy="30" r="15" fill={HEX[color]} />
          <circle cx="71" cy="30" r="15" fill={HEX[color]} />
        </>
      )
    case 'hood':
      return (
        <path
          d="M-4 104 L-4 52 C-4 0 104 0 104 52 L104 104 Z"
          fill={pick(color, '#3f3f46', '#57534e', ['gray'])}
        />
      )
    default:
      return null
  }
}

/** Costume layers drawn over the head and face: hats, glasses, the bow. */
function Over({ figure, color }: { figure: Figure; color: Color }) {
  switch (figure) {
    case 'horns':
      return (
        <g fill="#27272a">
          <path d="M26 32 Q16 12 26 2 Q28 18 38 26 Z" />
          <path d="M74 32 Q84 12 74 2 Q72 18 62 26 Z" />
        </g>
      )
    case 'beanie': {
      const wool = pick(color, '#1e3a8a', '#b45309', ['blue', 'plum'])
      return (
        <>
          <path d="M8 50 C8 6 92 6 92 50 Z" fill={wool} />
          <rect
            x="5"
            y="40"
            width="90"
            height="15"
            rx="7.5"
            fill={shade(wool, 0.18)}
          />
          <circle cx="50" cy="9" r="9" fill="#f5f5f4" />
        </>
      )
    }
    case 'cap': {
      const cloth = pick(color, '#dc2626', '#2563eb', ['red', 'orange', 'pink'])
      return (
        <>
          <path d="M10 48 C10 8 90 8 90 48 Z" fill={cloth} />
          <path
            d="M46 42 Q80 36 100 48 Q98 58 80 55 Q62 51 46 52 Z"
            fill={shade(cloth, -0.22)}
          />
          <circle cx="50" cy="12" r="3.5" fill={shade(cloth, -0.22)} />
        </>
      )
    }
    case 'bucket': {
      const canvas = pick(color, '#57534e', '#166534', ['sand', 'gray'])
      return (
        <>
          <path d="M20 44 L27 12 Q50 4 73 12 L80 44 Z" fill={canvas} />
          <ellipse cx="50" cy="45" rx="49" ry="10" fill={shade(canvas, -0.2)} />
          <path
            d="M22 36 Q50 30 78 36"
            stroke={shade(canvas, 0.2)}
            strokeWidth="3"
            fill="none"
          />
        </>
      )
    }
    case 'beret': {
      const felt = pick(color, '#9f1239', '#14532d', ['red', 'plum', 'pink'])
      return (
        <>
          <ellipse
            cx="44"
            cy="26"
            rx="42"
            ry="16"
            transform="rotate(-10 44 26)"
            fill={felt}
          />
          <rect x="42" y="6" width="5" height="9" rx="2.5" fill={felt} />
        </>
      )
    }
    case 'bandana': {
      const cloth = pick(color, '#dc2626', '#0f766e', ['red', 'orange', 'pink'])
      return (
        <>
          <path d="M8 50 C8 10 92 10 92 50 Q50 40 8 50 Z" fill={cloth} />
          <path d="M88 42 L100 32 L99 52 Z" fill={shade(cloth, -0.2)} />
          <path d="M88 46 L100 58 L91 61 Z" fill={shade(cloth, -0.2)} />
          <g fill="#fff" opacity="0.7">
            <circle cx="30" cy="30" r="2" />
            <circle cx="50" cy="22" r="2" />
            <circle cx="70" cy="30" r="2" />
          </g>
        </>
      )
    }
    case 'crown': {
      const gold = pick(color, '#f3b01c', '#e5e7eb', ['gold', 'orange', 'sand'])
      return (
        <g transform="rotate(12 60 22)">
          <path
            d="M42 32 L42 12 L50 21 L58 6 L66 21 L74 12 L74 32 Z"
            fill={gold}
          />
          <circle cx="58" cy="25" r="3" fill="#ee342f" />
        </g>
      )
    }
    case 'shades':
      return (
        <g>
          <rect x="12" y="52" width="76" height="17" rx="8" fill="#0a0a0a" />
          <path
            d="M20 56 L34 56"
            stroke="#fff"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.5"
          />
        </g>
      )
    case 'glasses':
      return (
        <g stroke={INK} strokeWidth="3" fill="none">
          <circle cx="37" cy="60" r="10.5" />
          <circle cx="63" cy="60" r="10.5" />
          <path d="M47.5 60 L52.5 60 M26.5 58 L8 54 M73.5 58 L92 54" />
        </g>
      )
    case 'headphones':
      return (
        <>
          <path
            d="M10 62 C10 8 90 8 90 62"
            stroke="#27272a"
            strokeWidth="8"
            fill="none"
          />
          <rect x="0" y="50" width="16" height="26" rx="7" fill="#3f3f46" />
          <rect x="84" y="50" width="16" height="26" rx="7" fill="#3f3f46" />
          <rect x="4" y="56" width="4" height="14" rx="2" fill="#ee342f" />
          <rect x="92" y="56" width="4" height="14" rx="2" fill="#ee342f" />
        </>
      )
    case 'bow': {
      const ribbon = pick(color, '#ee342f', '#0d9488', [
        'red',
        'pink',
        'orange',
      ])
      return (
        <g>
          <path d="M74 26 L57 14 Q53 26 57 38 Z" fill={ribbon} />
          <path d="M74 26 L91 14 Q95 26 91 38 Z" fill={ribbon} />
          <circle cx="74" cy="26" r="5.5" fill={shade(ribbon, -0.2)} />
        </g>
      )
    }
    case 'sprout': {
      const leaf = pick(color, '#16a34a', '#f3b01c', ['green', 'teal'])
      return (
        <g>
          <path
            d="M50 24 Q50 15 50 8"
            stroke={leaf}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <ellipse
            cx="42"
            cy="9"
            rx="8"
            ry="4.5"
            transform="rotate(-25 42 9)"
            fill={leaf}
          />
          <ellipse
            cx="58"
            cy="7"
            rx="8"
            ry="4.5"
            transform="rotate(25 58 7)"
            fill={leaf}
          />
        </g>
      )
    }
    default:
      return null
  }
}

/** Matilda's face: round eyes with a light catch, blush and a small smile. */
function Face({ figure, color }: { figure: Figure; color: Color }) {
  const eye = DARK.has(color) ? '#fafafa' : INK
  const shine = DARK.has(color) ? INK : '#fff'
  // A frog's eyes sit up on its bumps.
  const [ex, ey] = figure === 'frog' ? [21, 32] : [13, 60]
  return (
    <>
      {[50 - ex - 11, 50 + ex + 11].map((cx) => (
        <ellipse
          key={cx}
          cx={cx}
          cy={ey + 10}
          rx="6.5"
          ry="3.8"
          fill="#fb7185"
          opacity="0.45"
        />
      ))}
      {[50 - ex, 50 + ex].map((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy={ey} rx="5.4" ry="6.6" fill={eye} />
          <circle cx={cx + 1.8} cy={ey - 2.3} r="1.9" fill={shine} />
        </g>
      ))}
      <path
        d="M45.5 71 Q50 75.5 54.5 71"
        stroke={eye}
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
    </>
  )
}

/** A stable look for an assistant that hasn't picked one. */
export function defaultLook(name: string): Required<Look> {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return {
    shape: SHAPES[hash % SHAPES.length],
    color: COLORS[(hash >>> 8) % COLORS.length],
    figure: FIGURES[(hash >>> 16) % FIGURES.length],
  }
}

/** An assistant's look, or its default. A look saved without a figure gets one from the name. */
export function lookOf(a: { look?: Look; name: string }): Required<Look> {
  const fallback = defaultLook(a.name)
  return a.look
    ? { ...a.look, figure: a.look.figure ?? fallback.figure }
    : fallback
}

/** An assistant as a character on a tile: head, face and costume. */
export function BotAvatar({
  look,
  className,
}: {
  look: Look
  className?: string
}) {
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, '')
  const figure = look.figure ?? 'plain'
  const skin = HEX[look.color]
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={cn('inline-block size-4 shrink-0', className)}
    >
      <defs>
        <clipPath id={`${id}tile`}>
          <rect width="100" height="100" rx="24" />
        </clipPath>
        <linearGradient id={`${id}skin`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={shade(skin, 0.18)} />
          <stop offset="1" stopColor={shade(skin, -0.1)} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}tile)`}>
        <rect width="100" height="100" fill={shade(skin, -0.78)} />
        <Behind figure={figure} color={look.color} />
        <path d={HEADS[look.shape]} fill={`url(#${id}skin)`} />
        <Face figure={figure} color={look.color} />
        <Over figure={figure} color={look.color} />
      </g>
    </svg>
  )
}

/** A random look, for a new assistant. */
export function randomLook(): Required<Look> {
  const any = <T,>(list: ReadonlyArray<T>) =>
    list[Math.floor(Math.random() * list.length)]
  return { shape: any(SHAPES), color: any(COLORS), figure: any(FIGURES) }
}

/**
 * A big preview beside the figures, shapes and colors to pick from.
 * `children` (name fields, say) sit under the preview. Submits as the
 * `shape`, `color` and `figure` form fields.
 */
export function LookPicker({
  defaultValue,
  children,
}: {
  defaultValue: Required<Look>
  children?: React.ReactNode
}) {
  const [look, setLook] = React.useState(defaultValue)
  return (
    <div className="grid gap-6 sm:grid-cols-[11rem_1fr] sm:items-start">
      <input type="hidden" name="shape" value={look.shape} />
      <input type="hidden" name="color" value={look.color} />
      <input type="hidden" name="figure" value={look.figure} />
      <div className="flex flex-col items-center gap-3">
        <BotAvatar look={look} className="size-28 drop-shadow-lg" />
        {children}
      </div>
      <div className="flex flex-col gap-4">
        <div
          role="radiogroup"
          aria-label="Figure"
          className="flex flex-col gap-2"
        >
          <span className="text-xs text-muted-foreground">Figure</span>
          <div className="grid grid-cols-6 gap-1">
            {FIGURES.map((figure) => (
              <button
                key={figure}
                type="button"
                role="radio"
                aria-checked={look.figure === figure}
                aria-label={figure}
                title={figure}
                onClick={() => setLook((l) => ({ ...l, figure }))}
                className="grid place-items-center rounded-xl p-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-checked:bg-muted aria-checked:ring-1 aria-checked:ring-foreground/40"
              >
                <BotAvatar look={{ ...look, figure }} className="size-9" />
              </button>
            ))}
          </div>
        </div>
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
                onClick={() => setLook((l) => ({ ...l, shape }))}
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
                onClick={() => setLook((l) => ({ ...l, color }))}
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

/** The `shape`, `color` and `figure` fields a `LookPicker` submitted. The server validates them. */
export function lookFromForm(data: FormData): Required<Look> {
  return {
    shape: String(data.get('shape')) as Shape,
    color: String(data.get('color')) as Color,
    figure: String(data.get('figure')) as Figure,
  }
}
