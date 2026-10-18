import { defineSchema } from 'convex/server'
import { artifactsTable } from './models/artifacts/table'
import { emailConnectionsTable } from './models/emailConnections/table'
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
  emailConnections: emailConnectionsTable,
})
