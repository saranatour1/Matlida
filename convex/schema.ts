import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Messages live in the agent component; these tables index what the UI lists.
export default defineSchema({
  projects: defineTable({
    name: v.string(), // the project's lead goes by this name too
    brief: v.string(), // what the project is about, given to the lead
    guidelines: v.optional(v.string()), // rules the lead and every employee follow
  }),

  employees: defineTable({
    projectId: v.id('projects'),
    name: v.string(),
    role: v.string(),
    instructions: v.string(),
    // User-defined extras (Tone, KPIs, Budget...) fed into the employee's instructions.
    fields: v.array(v.object({ label: v.string(), value: v.string() })),
  }).index('by_project_and_name', ['projectId', 'name']),

  threads: defineTable({
    projectId: v.id('projects'),
    threadId: v.string(), // agent component thread
    kind: v.union(v.literal('chat'), v.literal('employee')),
    title: v.string(),
    parentThreadId: v.optional(v.string()), // the chat an employee thread came from
  })
    .index('by_project_and_kind', ['projectId', 'kind'])
    .index('by_threadId', ['threadId']),

  artifacts: defineTable({
    projectId: v.id('projects'),
    threadId: v.string(),
    title: v.string(),
    content: v.string(), // markdown
  }).index('by_project', ['projectId']),
})
