import { literals } from 'convex-helpers/validators'

/** The preset orb looks an assistant can wear. The app draws each one; nobody uploads images. */
export const AVATARS = [
  'aurora',
  'ember',
  'tide',
  'moss',
  'dusk',
  'sol',
  'frost',
  'plum',
  'coral',
  'ink',
  'sand',
  'iris',
] as const

export type Avatar = (typeof AVATARS)[number]

export const vAvatar = literals(...AVATARS)
