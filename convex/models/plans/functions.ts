import { ConvexError, v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { authedMutation, authedQuery } from '../../lib/functions'
import { getOwnedProject } from '../projects/queries'
import { plansTable } from './table'
import type { Id, MutationCtx } from '../../lib/ctx'

const vSteps = plansTable.validator.fields.steps
const vItems = v.array(
  v.object({ text: v.string(), section: v.optional(v.string()) }),
)

/**
 * Adds `items` to the workspace's list called `title`, like To-do or
 * Shopping list, starting it if there's none. Returns the list.
 */
async function addToList(
  ctx: MutationCtx,
  list: {
    projectId: Id<'projects'>
    threadId: string
    title: string
    items: Array<{ text: string; section?: string }>
  },
) {
  const steps = list.items.map((item) => ({ ...item, done: false }))
  const existing = (
    await ctx.db
      .query('plans')
      .withIndex('by_project', (q) => q.eq('projectId', list.projectId))
      .order('desc')
      .take(50)
  ).find((plan) => plan.title.toLowerCase() === list.title.toLowerCase())
  if (!existing) {
    return await ctx.db.insert('plans', {
      projectId: list.projectId,
      threadId: list.threadId,
      title: list.title,
      steps,
    })
  }
  await ctx.db.patch('plans', existing._id, {
    steps: [...existing.steps, ...steps],
  })
  return existing._id
}

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

/** One plan or list, for its card in the chat. Null once it's deleted, or when it isn't yours. */
const get = authedQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const planId = ctx.db.normalizeId('plans', id)
    const plan = planId && (await ctx.db.get('plans', planId))
    if (!plan) return null
    const project = await ctx.db.get('projects', plan.projectId)
    return project?.ownerId === ctx.userId ? plan : null
  },
})

/** `add_to_list`: adds items to a list, starting it if needed. */
const addItems = internalMutation({
  args: {
    projectId: v.id('projects'),
    threadId: v.string(),
    title: v.string(),
    items: vItems,
  },
  returns: v.id('plans'),
  handler: addToList,
})

/** A card's "Add to shopping list". */
const addToYourList = authedMutation({
  args: {
    projectId: v.id('projects'),
    threadId: v.string(),
    title: v.string(),
    items: vItems,
  },
  handler: async (ctx, args) => {
    await getOwnedProject(ctx, ctx.userId, args.projectId)
    return await addToList(ctx, args)
  },
})

/** Drops the ticked-off items from a list. */
const clearDone = authedMutation({
  args: { id: v.id('plans') },
  handler: async (ctx, { id }) => {
    const plan = await ctx.db.get('plans', id)
    if (!plan) throw new ConvexError('List not found.')
    await getOwnedProject(ctx, ctx.userId, plan.projectId)
    await ctx.db.patch('plans', id, {
      steps: plan.steps.filter((s) => !s.done),
    })
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

export const plansApi = {
  list,
  get,
  write,
  addItems,
  addToYourList,
  clearDone,
  toggleStep,
  remove,
}
