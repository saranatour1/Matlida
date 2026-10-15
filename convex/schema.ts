import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Messages live in the agent component; these tables index what the UI lists.
export default defineSchema({
  employees: defineTable({
    name: v.string(),
    role: v.string(),
    instructions: v.string(),
    // User-defined extras (Tone, KPIs, Budget...) fed into the employee's instructions.
    fields: v.array(v.object({ label: v.string(), value: v.string() })),
  }).index('by_name', ['name']),

  threads: defineTable({
    threadId: v.string(), // agent component thread
    kind: v.union(v.literal('chat'), v.literal('employee')),
    title: v.string(),
    parentThreadId: v.optional(v.string()), // the chat an employee thread came from
  })
    .index('by_kind', ['kind'])
    .index('by_threadId', ['threadId']),

  artifacts: defineTable({
    threadId: v.string(),
    title: v.string(),
    content: v.string(), // markdown
  }),
})
