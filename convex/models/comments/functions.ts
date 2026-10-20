import { zid } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import {
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import { getOwnedProject } from '../projects/functions'
import { commentsTable } from './table'
import type { Doc, Id } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'

export const MAX_COMMENTS = 100

const zTarget = {
  projectId: zid('projects'),
  kind: z.enum(['project', 'bot', 'command']),
  targetId: z.string().max(100),
}

/** Throws unless the target is in `project`: the project itself, one of its bots, or one of its commands. */
async function checkTarget(
  ctx: Pick<QueryCtx, 'db'>,
  project: Doc<'projects'>,
  kind: Doc<'comments'>['kind'],
  targetId: string,
) {
  if (kind === 'project') {
    if (targetId !== project._id)
      throw new ConvexError('Not in this workspace.')
    return
  }
  const target =
    kind === 'bot'
      ? await botById(ctx, targetId)
      : await commandById(ctx, targetId)
  if (target?.projectId !== project._id) {
    throw new ConvexError('Not in this workspace.')
  }
}

async function botById(ctx: Pick<QueryCtx, 'db'>, targetId: string) {
  const id = ctx.db.normalizeId('bots', targetId)
  return id ? await ctx.db.get('bots', id) : null
}

async function commandById(ctx: Pick<QueryCtx, 'db'>, targetId: string) {
  const id = ctx.db.normalizeId('commands', targetId)
  return id ? await ctx.db.get('commands', id) : null
}

async function getComments(
  ctx: Pick<QueryCtx, 'db'>,
  projectId: Id<'projects'>,
  kind: Doc<'comments'>['kind'],
  targetId: string,
) {
  return await ctx.db
    .query('comments')
    .withIndex('by_target', (q) =>
      q.eq('projectId', projectId).eq('kind', kind).eq('targetId', targetId),
    )
    .take(MAX_COMMENTS)
}

/** Deletes every comment on a target, when the target goes. */
export async function removeComments(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  kind: Doc<'comments'>['kind'],
  targetId: string,
) {
  for (const comment of await getComments(ctx, projectId, kind, targetId)) {
    await ctx.db.delete('comments', comment._id)
  }
}

/** The notes on one text, oldest first. */
const list = authedQuery({
  args: {
    projectId: v.id('projects'),
    kind: commentsTable.validator.fields.kind,
    targetId: v.string(),
  },
  handler: async (ctx, { projectId, kind, targetId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await getComments(ctx, projectId, kind, targetId)
  },
})

/** Leaves a note on a passage of a text in your workspace. */
const add = zAuthedMutation({
  args: {
    ...zTarget,
    quote: z
      .string()
      .trim()
      .min(1, 'Select the text the note is about.')
      .max(500, 'Select at most 500 characters.'),
    text: z
      .string()
      .trim()
      .min(1, 'Write the note.')
      .max(2000, 'Notes can be at most 2000 characters.'),
  },
  handler: async (ctx, { projectId, kind, targetId, quote, text }) => {
    const project = await getOwnedProject(ctx, ctx.userId, projectId)
    await checkTarget(ctx, project, kind, targetId)
    const existing = await getComments(ctx, projectId, kind, targetId)
    if (existing.length >= MAX_COMMENTS) {
      throw new ConvexError(`A text can have at most ${MAX_COMMENTS} notes.`)
    }
    return await ctx.db.insert('comments', {
      projectId,
      kind,
      targetId,
      quote,
      text,
      resolved: false,
    })
  },
})

async function getOwnedComment(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
  id: Id<'comments'>,
) {
  const comment = await ctx.db.get('comments', id)
  if (!comment) throw new ConvexError('Note not found.')
  await getOwnedProject(ctx, userId, comment.projectId)
  return comment
}

const setResolved = authedMutation({
  args: { id: v.id('comments'), resolved: v.boolean() },
  handler: async (ctx, { id, resolved }) => {
    await getOwnedComment(ctx, ctx.userId, id)
    await ctx.db.patch('comments', id, { resolved })
  },
})

const remove = authedMutation({
  args: { id: v.id('comments') },
  handler: async (ctx, { id }) => {
    await getOwnedComment(ctx, ctx.userId, id)
    await ctx.db.delete('comments', id)
  },
})

export const commentsApi = { list, add, setResolved, remove }
