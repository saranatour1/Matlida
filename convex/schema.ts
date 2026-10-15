import { defineSchema } from 'convex/server'
import { artifactsTable } from './models/artifacts/table'
import { employeesTable } from './models/employees/table'
import { projectsTable } from './models/projects/table'
import { threadsTable } from './models/threads/table'

export default defineSchema({
  projects: projectsTable,
  employees: employeesTable,
  threads: threadsTable,
  artifacts: artifactsTable,
})
