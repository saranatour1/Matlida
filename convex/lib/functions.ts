import { NoOp } from 'convex-helpers/server/customFunctions'
import { zCustomMutation } from 'convex-helpers/server/zod4'
import { mutation } from '../_generated/server'

/**
 * A public mutation whose args are Zod schemas, for validating user input at the
 * boundary. Failed args throw `ConvexError({ ZodError: issues })`.
 */
export const zMutation = zCustomMutation(mutation, NoOp)
