import { WorkflowManager } from '@convex-dev/workflow'
import { components } from '../_generated/api'

/** Runs tasks (`convex/models/tasks`) as durable workflows: each step retried on its own, and paused while waiting for the user. */
export const workflow = new WorkflowManager(components.workflow)
