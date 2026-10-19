import { literals } from 'convex-helpers/validators'
import { v } from 'convex/values'
import { z } from 'zod'

/**
 * How an assistant looks: a character with a head shape, a skin color and a
 * costume, drawn on a tile. The app draws them, so nobody uploads images. The
 * trefoil and swirl heads borrow from Convex's mark, the kite from Matilda's.
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

/** The costume a character wears: ears, a hat, glasses, a hood. */
export const FIGURES = [
  'plain',
  'cat',
  'bear',
  'bunny',
  'frog',
  'horns',
  'beanie',
  'cap',
  'bucket',
  'beret',
  'bandana',
  'crown',
  'shades',
  'glasses',
  'headphones',
  'bow',
  'sprout',
  'hood',
] as const

export type Shape = (typeof SHAPES)[number]
export type Color = (typeof COLORS)[number]
export type Figure = (typeof FIGURES)[number]
/** `figure` is optional so looks saved before figures existed stay valid. */
export type Look = { shape: Shape; color: Color; figure?: Figure }

export const vLook = v.object({
  shape: literals(...SHAPES),
  color: literals(...COLORS),
  figure: v.optional(literals(...FIGURES)),
})

/** The same look as a Zod schema, for validating user input and template links. */
export const zLook = z.object({
  shape: z.enum(SHAPES),
  color: z.enum(COLORS),
  figure: z.enum(FIGURES).optional(),
})
