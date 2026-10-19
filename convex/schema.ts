import { defineSchema } from 'convex/server'
import { projectsTable } from './models/projects/table'
import { threadsTable } from './models/threads/table'
import { usersTable } from './models/users/table'

export default defineSchema({
  users: usersTable,
  projects: projectsTable,
  threads: threadsTable,
})
