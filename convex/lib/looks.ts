import { literals } from 'convex-helpers/validators'
import { v } from 'convex/values'

/**
 * How an assistant looks: a body shape and a color, drawn as a glossy gem.
 * The app draws them, so nobody uploads images. The trefoil and swirl borrow
 * from Convex's mark, the kite from Matilda's.
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

export type Shape = (typeof SHAPES)[number]
export type Color = (typeof COLORS)[number]
export type Look = { shape: Shape; color: Color }

export const vLook = v.object({
  shape: literals(...SHAPES),
  color: literals(...COLORS),
})
