import { defineSchema } from 'convex/server'
import { aiConnectionsTable } from './models/aiConnections/table'
import { artifactsTable } from './models/artifacts/table'
import { employeesTable } from './models/employees/table'
import { projectsTable } from './models/projects/table'
import { threadsTable } from './models/threads/table'
import { usersTable } from './models/users/table'

export default defineSchema({
  users: usersTable,
  projects: projectsTable,
  employees: employeesTable,
  threads: threadsTable,
  artifacts: artifactsTable,
  aiConnections: aiConnectionsTable,
})
