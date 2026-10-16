import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const employeesTable = defineTable({
  projectId: v.id('projects'),
  name: v.string(),
  role: v.string(),
  instructions: v.string(),
  /** User-defined extras (Tone, KPIs, Budget...) added to the employee's instructions. */
  fields: v.array(v.object({ label: v.string(), value: v.string() })),
}).index('by_project_and_name', ['projectId', 'name'])
