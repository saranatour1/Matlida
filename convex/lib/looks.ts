import { literals } from 'convex-helpers/validators'
import { v } from 'convex/values'
import { z } from 'zod'

/**
 * How an assistant looks: a body shape, a color and an emblem, drawn as a
 * glossy gem. The app draws them, so nobody uploads images. The trefoil and
 * swirl borrow from Convex's mark, the kite from Matilda's.
 */
export const SHAPES = [
  'round',
  'squircle',
  'pebble',
  'trefoil',
  'swirl',
  'clover',
  'flower',
  'star',
  'burst',
  'diamond',
  'hexagon',
  'triangle',
  'kite',
] as const

/** Convex's red, gold and plum, filled out to a full palette. */
export const COLORS = [
  'white',
  'sand',
  'red',
  'orange',
  'gold',
  'green',
  'teal',
  'blue',
  'plum',
  'pink',
  'gray',
] as const

/** The emblem on the body, a hint at what the assistant is for. */
export const MARKS = [
  'bolt',
  'leaf',
  'book',
  'pen',
  'globe',
  'code',
  'flask',
  'compass',
  'rocket',
  'heart',
  'calendar',
  'chart',
] as const

export type Shape = (typeof SHAPES)[number]
export type Color = (typeof COLORS)[number]
export type Mark = (typeof MARKS)[number]
/** `mark` is optional so looks saved before emblems existed stay valid. */
export type Look = { shape: Shape; color: Color; mark?: Mark }

export const vLook = v.object({
  shape: literals(...SHAPES),
  color: literals(...COLORS),
  mark: v.optional(literals(...MARKS)),
})

/** The same look as a Zod schema, for validating user input and template links. */
export const zLook = z.object({
  shape: z.enum(SHAPES),
  color: z.enum(COLORS),
  mark: z.enum(MARKS).optional(),
})
