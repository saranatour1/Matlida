import { saveMessage } from '@convex-dev/agent'
import {
  cancel as cancelWorkflow,
  defineEvent,
  sendEvent,
  start,
  vResultValidator,
  vWorkflowId,
} from '@convex-dev/workflow'
import { literals } from 'convex-helpers/validators'
import { ConvexError, v } from 'convex/values'
import { components, internal } from '../../_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import { authedMutation, authedQuery } from '../../lib/functions'
import { workflow } from '../../lib/workflow'
import schema from '../../schema'
import { getOwnedProject } from '../projects/queries'
import { startThread } from '../threads/functions'
import { getMembers, getOwnedThread } from '../threads/queries'
import { createAgent } from '../threads/lead'
import type { Doc, Id, MutationCtx } from '../../lib/ctx'

/** The user's answer on a task's card: Start, or Don't start. */
const startEvent = defineEvent({
  name: 'start',
  validator: v.object({ start: v.boolean() }),
})

/** How much of a step's result its card shows. The whole result stays in the task's work thread. */
const DETAIL_CHARS = 400

/**
 * Turns a saved plan into a task that waits for the user's Start, then works
 * through the steps in a workflow. For the `run_plan` tool.
 */
const startPlan = internalMutation({
  args: {
    projectId: v.id('projects'),
    threadId: v.string(),
    /** From the model, so it may not be a valid id. */
    planId: v.string(),
  },
  returns: v.id('tasks'),
  handler: async (ctx, { projectId, threadId, planId }) => {
    const id = ctx.db.normalizeId('plans', planId)
    const plan = id && (await ctx.db.get('plans', id))
    if (!plan || plan.projectId !== projectId) {
      throw new Error('No such plan in this workspace.')
    }
    const chat = await ctx.db
      .query('threads')
      .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
      .unique()
    if (chat?.kind !== 'chat') {
      throw new Error("A plan can't start another plan.")
    }
    const project = await ctx.db.get('projects', projectId)
    if (!project) throw new Error('No such workspace.')
    const workThreadId = await startThread(ctx, {
      projectId,
      kind: 'subagent',
      title: `Task: ${plan.title}`,
      parentThreadId: threadId,
      userId: project.ownerId,
    })
    const taskId = await ctx.db.insert('tasks', {
      projectId,
      threadId,
      workThreadId,
      kind: 'run_plan',
      title: plan.title,
      planId: plan._id,
      effort: chat.effort ?? project.effort,
      status: 'waiting_for_you',
      steps: plan.steps.map((s) => ({ name: s.text, status: 'todo' })),
    })
    const workflowId = await start(
      ctx,
      internal.api.tasks.runPlan,
      { taskId },
      { onComplete: internal.api.tasks.finished, context: taskId },
    )
    await ctx.db.patch('tasks', taskId, { workflowId })
    return taskId
  },
})

/** The workflow behind `run_plan`: wait for Start, then one step at a time, each retried on its own. */
const runPlan = workflow
  .define({ args: { taskId: v.id('tasks') } })
  .handler(async (step, { taskId }): Promise<void> => {
    const answer = await step.awaitEvent(startEvent)
    if (!answer.start) return
    const count: number = await step.runQuery(internal.api.tasks.stepCount, {
      taskId,
    })
    for (let index = 0; index < count; index++) {
      await step.runMutation(internal.api.tasks.setStep, {
        taskId,
        index,
        status: 'running',
      })
      const detail: string = await step.runAction(
        internal.api.tasks.doStep,
        { taskId, index },
        { retry: true },
      )
      await step.runMutation(internal.api.tasks.setStep, {
        taskId,
        index,
        status: 'done',
        detail,
      })
    }
  })

const stepCount = internalQuery({
  args: { taskId: v.id('tasks') },
  returns: v.number(),
  handler: async (ctx, { taskId }) =>
    (await ctx.db.get('tasks', taskId))?.steps.length ?? 0,
})

/** Moves one step along and stamps its times. A finished step also ticks the plan's checklist. */
const setStep = internalMutation({
  args: {
    taskId: v.id('tasks'),
    index: v.number(),
    status: literals('running', 'done'),
    detail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, index, status, detail }) => {
    const task = await ctx.db.get('tasks', taskId)
    if (!task) return null
    const now = Date.now()
    await ctx.db.patch('tasks', taskId, {
      status: 'running',
      steps: task.steps.map((s, i) =>
        i !== index
          ? s
          : status === 'running'
            ? { ...s, status, startedAt: now }
            : { ...s, status, detail, endedAt: now },
      ),
    })
    const plan = task.planId && (await ctx.db.get('plans', task.planId))
    if (plan && status === 'done' && plan.steps[index]) {
      await ctx.db.patch('plans', plan._id, {
        steps: plan.steps.map((s, i) =>
          i === index ? { ...s, done: true } : s,
        ),
      })
    }
    return null
  },
})

/** Facts one step needs. */
const stepContext = internalQuery({
  args: { taskId: v.id('tasks') },
  returns: v.object({
    task: schema.doc('tasks'),
    project: schema.doc('projects'),
    bots: v.array(schema.doc('bots')),
  }),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get('tasks', taskId)
    const project = task && (await ctx.db.get('projects', task.projectId))
    if (!task || !project) throw new Error(`Task ${taskId} is gone.`)
    // The steps can hand work to the bots in the chat that started the task.
    const chat = await ctx.db
      .query('threads')
      .withIndex('by_threadId', (q) => q.eq('threadId', task.threadId))
      .unique()
    return { task, project, bots: await getMembers(ctx, chat) }
  },
})

/** Does one step with the lead in the task's work thread, where it sees the steps before it. Returns a short result. */
const doStep = internalAction({
  args: { taskId: v.id('tasks'), index: v.number() },
  returns: v.string(),
  handler: async (ctx, { taskId, index }): Promise<string> => {
    const {
      task,
      project,
      bots,
    }: {
      task: Doc<'tasks'>
      project: Doc<'projects'>
      bots: Array<Doc<'bots'>>
    } = await ctx.runQuery(internal.api.tasks.stepContext, { taskId })
    const agent = createAgent(ctx, project, {
      members: bots,
      effort: task.effort,
    })
    const step = task.steps[index]
    const { text }: { text: string } = await agent.generateText(
      ctx,
      { threadId: task.workThreadId, userId: project.ownerId },
      {
        prompt: `You're working through the plan "${task.title}", step ${index + 1} of ${task.steps.length}: ${step.name}\n\nDo this step now with your tools. The earlier steps' results are above. End with what you did or found, in a few sentences.`,
      },
    )
    return text.length > DETAIL_CHARS
      ? `${text.slice(0, DETAIL_CHARS - 1)}…`
      : text
  },
})

/** Closes a task when its workflow ends, and says how it went in the chat. */
const finished = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.id('tasks'),
  },
  returns: v.null(),
  handler: async (ctx, { result, context: taskId }) => {
    const task = await ctx.db.get('tasks', taskId)
    if (!task || task.status === 'cancelled') return null
    if (result.kind === 'success') {
      // A task the user chose not to start never ran a step.
      if (task.steps.every((s) => s.status === 'todo')) {
        await ctx.db.patch('tasks', taskId, { status: 'cancelled' })
        return null
      }
      await ctx.db.patch('tasks', taskId, { status: 'done' })
      await say(ctx, task, `✅ **Done:** ${task.title}`)
      return null
    }
    const error =
      result.kind === 'failed' ? result.error : 'The task was stopped.'
    await ctx.db.patch('tasks', taskId, {
      status: result.kind === 'canceled' ? 'cancelled' : 'failed',
      steps: task.steps.map((s) =>
        s.status === 'running'
          ? { ...s, status: 'failed', detail: error, endedAt: Date.now() }
          : s,
      ),
    })
    if (result.kind === 'failed') {
      await say(ctx, task, `⚠️ **Stopped:** ${task.title}\n\n_${error}_`)
    }
    return null
  },
})

async function say(ctx: MutationCtx, task: Doc<'tasks'>, content: string) {
  await saveMessage(ctx, components.agent, {
    threadId: task.threadId,
    message: { role: 'assistant', content },
  })
}

async function getOwnedTask(
  ctx: MutationCtx,
  userId: Id<'users'>,
  taskId: Id<'tasks'>,
) {
  const task = await ctx.db.get('tasks', taskId)
  if (!task) throw new ConvexError('Task not found.')
  await getOwnedProject(ctx, userId, task.projectId)
  return task
}

/** The user's Start or Don't start on a task waiting for them. */
const answer = authedMutation({
  args: { taskId: v.id('tasks'), start: v.boolean() },
  handler: async (ctx, { taskId, start: go }) => {
    const task = await getOwnedTask(ctx, ctx.userId, taskId)
    if (task.status !== 'waiting_for_you' || !task.workflowId) return
    await ctx.db.patch('tasks', taskId, {
      status: go ? 'running' : 'cancelled',
    })
    await sendEvent(ctx, components.workflow, {
      ...startEvent,
      workflowId: task.workflowId as never,
      value: { start: go },
    })
  },
})

/** Stops a task. A step already running finishes, but nothing after it starts. */
const cancel = authedMutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await getOwnedTask(ctx, ctx.userId, taskId)
    if (task.status !== 'waiting_for_you' && task.status !== 'running') return
    if (task.workflowId) {
      await cancelWorkflow(ctx, components.workflow, task.workflowId as never)
    }
    await ctx.db.patch('tasks', taskId, {
      status: 'cancelled',
      steps: task.steps.map((s) =>
        s.status === 'todo' || s.status === 'running'
          ? { ...s, status: 'skipped' }
          : s,
      ),
    })
  },
})

/** One task, for its card in the chat. */
const get = authedQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get('tasks', taskId)
    if (!task) return null
    await getOwnedProject(ctx, ctx.userId, task.projectId)
    return task
  },
})

/** A chat's tasks, newest first, for the details panel. */
const forThread = authedQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    if (!(await getOwnedThread(ctx, ctx.userId, threadId))) return []
    return await ctx.db
      .query('tasks')
      .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
      .order('desc')
      .take(20)
  },
})

export const tasksApi = {
  startPlan,
  runPlan,
  stepCount,
  setStep,
  stepContext,
  doStep,
  finished,
  answer,
  cancel,
  get,
  forThread,
}
