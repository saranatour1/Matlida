import { defineSchema } from 'convex/server'
import { usersTable } from './models/users/table'

export default defineSchema({
  users: usersTable,
})
