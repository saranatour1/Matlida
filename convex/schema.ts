import { defineSchema } from 'convex/server'
import { botsTable } from './models/bots/table'
import { commandsTable } from './models/commands/table'
import { projectsTable } from './models/projects/table'
import { threadsTable } from './models/threads/table'
import { usersTable } from './models/users/table'

export default defineSchema({
  users: usersTable,
  projects: projectsTable,
  threads: threadsTable,
  bots: botsTable,
  commands: commandsTable,
})
