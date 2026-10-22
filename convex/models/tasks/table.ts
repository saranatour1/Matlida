import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Longer work an assistant hands to a workflow, shown in the chat as a card
 * with live steps. `run_plan` works through a saved plan step by step, after
 * the user presses Start.
 */
export const tasksTable = defineTable({
  projectId: v.id('projects'),
  /** The chat that asked for it. Its card and the summary go there. */
  threadId: v.string(),
  kind: literals('run_plan'),
  title: v.string(),
  planId: v.optional(v.id('plans')),
  effort: v.optional(literals('low', 'medium', 'high')),
  status: literals('waiting_for_you', 'running', 'done', 'failed', 'cancelled'),
  steps: v.array(
    v.object({
      name: v.string(),
      status: literals('todo', 'running', 'done', 'failed', 'skipped'),
      /** What the step found or did, shortened, or why it failed. */
      detail: v.optional(v.string()),
      startedAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
    }),
  ),
  workflowId: v.optional(v.string()),
})
  .index('by_project', ['projectId'])
  .index('by_threadId', ['threadId'])
