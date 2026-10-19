import { literals } from 'convex-helpers/validators'
import { z } from 'zod'

/**
 * The ready-made portraits an assistant can wear, served from
 * `public/avatars/<id>.jpg`. Nobody uploads images.
 */
export const PORTRAITS = [
  'matilda',
  'coder',
  'researcher',
  'writer',
  'planner',
  'engineer',
  'chef',
  'cat',
  'frog',
  'bear',
  'bunny',
  'robot',
  'ghost',
  'buns',
  'beanie',
  'curls',
  'scarf',
  'tabby',
  'crown',
  'bandana',
  'fox',
  'silver',
] as const

export type Portrait = (typeof PORTRAITS)[number]

export const vPortrait = literals(...PORTRAITS)

/** The same list as a Zod schema, for user input and template links. */
export const zPortrait = z.enum(PORTRAITS)
