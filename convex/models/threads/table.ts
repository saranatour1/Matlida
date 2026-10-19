import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** The app's index of agent threads. Messages live in the agent component. */
export const threadsTable = defineTable({
  projectId: v.id('projects'),
  /** The agent component's thread id. */
  threadId: v.string(),
  /** A chat with the user, or a sub-thread where the lead hands work to a bot. */
  kind: literals('chat', 'subagent'),
  title: v.string(),
  /** The assistant this thread talks to. Unset means the project's lead. */
  botId: v.optional(v.id('bots')),
  /**
   * Assistants this thread's assistant can hand work to. Unset means all of
   * the workspace's bots for the lead, and none for a bot.
   */
  memberIds: v.optional(v.array(v.id('bots'))),
  /** For sub-threads: the chat they came from. */
  parentThreadId: v.optional(v.string()),
})
  .index('by_project_and_kind', ['projectId', 'kind'])
  .index('by_project_and_bot', ['projectId', 'botId', 'kind'])
  .index('by_threadId', ['threadId'])
