import agentTest from '@convex-dev/agent/test'
import workflowTest from '@convex-dev/workflow/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import { languageModel } from '../../lib/ai'
import schema from '../../schema'
import { modules } from '../../test.setup'

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/ai', async () => {
  const { mockModel } = await import('@convex-dev/agent')
  return {
    languageModel: mockModel({
      content: [{ type: 'text', text: 'Step result.' }],
    }),
  }
})

const calls = (languageModel as unknown as { doGenerateCalls: Array<unknown> })
  .doGenerateCalls

beforeEach(() => {
  vi.useFakeTimers()
  calls.length = 0
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const setup = async () => {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  workflowTest.register(t)
  const [ada, bob] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { name: 'Ada' }),
    await ctx.db.insert('users', { name: 'Bob' }),
  ])
  const asAda = t.withIdentity({ subject: ada })
  const asBob = t.withIdentity({ subject: bob })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  const threadId = await t.mutation(internal.api.threads.startMain, {
    projectId,
  })
  const planId = await t.mutation(internal.api.plans.write, {
    projectId,
    threadId,
    title: 'Launch week',
    steps: [
      { text: 'List the channels', done: false },
      { text: 'Draft the announcement', done: false },
    ],
  })
  const startPlan = () =>
    t.mutation(internal.api.tasks.startPlan, { projectId, threadId, planId })
  const run = () => t.finishAllScheduledFunctions(vi.runAllTimers)
  const task = (taskId: Awaited<ReturnType<typeof startPlan>>) =>
    asAda.query(api.api.tasks.get, { taskId })
  const chat = async () => {
    const { page } = await asAda.query(api.api.chat.listMessages, {
      threadId,
      paginationOpts: { numItems: 20, cursor: null },
    })
    return page.map((m) => m.text)
  }
  return {
    t,
    asAda,
    asBob,
    projectId,
    threadId,
    planId,
    startPlan,
    run,
    task,
    chat,
  }
}

test('a plan waits for Start, then runs step by step and ticks the plan', async () => {
  const { t, asAda, planId, startPlan, run, task, chat } = await setup()
  const taskId = await startPlan()
  await run()
  expect(await task(taskId)).toMatchObject({
    status: 'waiting_for_you',
    steps: [
      { name: 'List the channels', status: 'todo' },
      { name: 'Draft the announcement', status: 'todo' },
    ],
  })
  expect(calls).toHaveLength(0)

  await asAda.mutation(api.api.tasks.answer, { taskId, start: true })
  await run()
  const done = await task(taskId)
  expect(done).toMatchObject({
    status: 'done',
    steps: [
      { status: 'done', detail: 'Step result.' },
      { status: 'done', detail: 'Step result.' },
    ],
  })
  expect(done?.steps[0].endedAt).toBeGreaterThanOrEqual(
    done?.steps[0].startedAt ?? Infinity,
  )
  expect(calls).toHaveLength(2)
  expect(JSON.stringify(calls[1])).toContain(
    'step 2 of 2: Draft the announcement',
  )
  const plan = await t.run((ctx) => ctx.db.get('plans', planId))
  expect(plan?.steps.map((s) => s.done)).toEqual([true, true])
  expect(await chat()).toContain('✅ **Done:** Launch week')
})

test("Don't start ends the task without running a step", async () => {
  const { asAda, startPlan, run, task } = await setup()
  const taskId = await startPlan()
  await run()
  await asAda.mutation(api.api.tasks.answer, { taskId, start: false })
  await run()
  expect(await task(taskId)).toMatchObject({ status: 'cancelled' })
  expect(calls).toHaveLength(0)
})

test('cancelling a task skips the steps that hadn’t run', async () => {
  const { asAda, startPlan, run, task } = await setup()
  const taskId = await startPlan()
  await run()
  await asAda.mutation(api.api.tasks.cancel, { taskId })
  await run()
  expect(await task(taskId)).toMatchObject({
    status: 'cancelled',
    steps: [{ status: 'skipped' }, { status: 'skipped' }],
  })
  expect(calls).toHaveLength(0)
})

test('a step that keeps failing stops the task and says so in the chat', async () => {
  const { asAda, startPlan, run, task, chat } = await setup()
  const generate = vi
    .spyOn(languageModel, 'doGenerate')
    .mockRejectedValue(new Error('Gateway is down'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const taskId = await startPlan()
  await run()
  await asAda.mutation(api.api.tasks.answer, { taskId, start: true })
  await run()
  // Tried once: a retry would pay for the model again, and could repeat what the step did.
  expect(generate).toHaveBeenCalledTimes(1)
  const failed = await task(taskId)
  expect(failed).toMatchObject({
    status: 'failed',
    steps: [{ status: 'failed' }, { status: 'todo' }],
  })
  expect(failed?.steps[0].detail).toContain('Gateway is down')
  expect(
    (await chat()).some((m) => m.startsWith('⚠️ **Stopped:** Launch week')),
  ).toBe(true)
})

test('only the owner can start or see a task, and a task can’t start a plan', async () => {
  const { asBob, startPlan, run } = await setup()
  const taskId = await startPlan()
  await run()
  await expect(
    asBob.mutation(api.api.tasks.answer, { taskId, start: true }),
  ).rejects.toThrow('Project not found.')
  await expect(asBob.query(api.api.tasks.get, { taskId })).rejects.toThrow(
    'Project not found.',
  )
})

test('Try again runs only the step that failed, then finishes the task', async () => {
  const { asAda, asBob, startPlan, run, task, chat } = await setup()
  const original = languageModel.doGenerate.bind(languageModel)
  let made = 0
  const generate = vi
    .spyOn(languageModel, 'doGenerate')
    .mockImplementation((options) =>
      ++made === 2
        ? Promise.reject(new Error('Gateway is down'))
        : original(options),
    )
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const taskId = await startPlan()
  await run()
  await asAda.mutation(api.api.tasks.answer, { taskId, start: true })
  await run()
  expect(await task(taskId)).toMatchObject({
    status: 'failed',
    steps: [{ status: 'done' }, { status: 'failed' }],
  })

  await expect(
    asBob.mutation(api.api.tasks.retry, { taskId }),
  ).rejects.toThrow()
  await asAda.mutation(api.api.tasks.retry, { taskId })
  await run()
  expect(await task(taskId)).toMatchObject({
    status: 'done',
    steps: [{ status: 'done' }, { status: 'done' }],
  })
  // Step 1 once, step 2 failed once and ran again once.
  expect(generate).toHaveBeenCalledTimes(3)
  expect(await chat()).toContain('✅ **Done:** Launch week')
})
