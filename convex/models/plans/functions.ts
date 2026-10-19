import { ConvexError, v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { authedMutation, authedQuery } from '../../lib/functions'
import { getOwnedProject } from '../projects/functions'
import { plansTable } from './table'

const vSteps = plansTable.validator.fields.steps

const list = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await ctx.db
      .query('plans')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .order('desc')
      .take(50)
  },
})

/** Creates a plan, or replaces its steps when `planId` is given. For assistants' tools. */
const write = internalMutation({
  args: {
    projectId: v.id('projects'),
    threadId: v.string(),
    /** From the model, so it may not be a valid id. */
    planId: v.optional(v.string()),
    title: v.string(),
    steps: vSteps,
  },
  returns: v.id('plans'),
  handler: async (ctx, { planId, ...plan }) => {
    if (!planId) return await ctx.db.insert('plans', plan)
    const id = ctx.db.normalizeId('plans', planId)
    const existing = id && (await ctx.db.get('plans', id))
    if (!existing || existing.projectId !== plan.projectId) {
      throw new Error('No such plan in this workspace.')
    }
    await ctx.db.patch('plans', existing._id, {
      title: plan.title,
      steps: plan.steps,
    })
    return existing._id
  },
})

const toggleStep = authedMutation({
  args: { id: v.id('plans'), index: v.number() },
  handler: async (ctx, { id, index }) => {
    const plan = await ctx.db.get('plans', id)
    if (!plan) throw new ConvexError('Plan not found.')
    await getOwnedProject(ctx, ctx.userId, plan.projectId)
    const steps = plan.steps.map((s, i) =>
      i === index ? { ...s, done: !s.done } : s,
    )
    await ctx.db.patch('plans', id, { steps })
  },
})

const remove = authedMutation({
  args: { id: v.id('plans') },
  handler: async (ctx, { id }) => {
    const plan = await ctx.db.get('plans', id)
    if (!plan) throw new ConvexError('Plan not found.')
    await getOwnedProject(ctx, ctx.userId, plan.projectId)
    await ctx.db.delete('plans', id)
  },
})

export const plansApi = { list, write, toggleStep, remove }
