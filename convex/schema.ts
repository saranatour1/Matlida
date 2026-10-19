import { defineSchema } from 'convex/server'
import { botsTable } from './models/bots/table'
import { commandsTable } from './models/commands/table'
import { projectsTable } from './models/projects/table'
import { plansTable } from './models/plans/table'
import { phoneLinksTable } from './models/texts/table'
import { threadsTable } from './models/threads/table'
import { usageTable } from './models/usage/table'
import { usersTable } from './models/users/table'

export default defineSchema({
  users: usersTable,
  projects: projectsTable,
  threads: threadsTable,
  bots: botsTable,
  commands: commandsTable,
  phoneLinks: phoneLinksTable,
  plans: plansTable,
  usage: usageTable,
})
