import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * One row per account, holding the profile from the latest sign-in. Passwords,
 * emails and linked providers live in the auth components.
 */
export const usersTable = defineTable({
  name: v.optional(v.string()),
  /** Only a verified address is stored. */
  email: v.optional(v.string()),
  image: v.optional(v.string()),
  /** The GitHub login, for accounts that use GitHub. */
  username: v.optional(v.string()),
})
