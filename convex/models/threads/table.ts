import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** The app's index of agent threads. Messages live in the agent component. */
export const threadsTable = defineTable({
  projectId: v.id('projects'),
  /** The agent component's thread id. */
  threadId: v.string(),
  kind: literals('chat', 'employee'),
  title: v.string(),
  /** For employee threads: the chat they came from. */
  parentThreadId: v.optional(v.string()),
})
  .index('by_project_and_kind', ['projectId', 'kind'])
  .index('by_threadId', ['threadId'])
