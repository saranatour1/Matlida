import { zid } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import {
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import { getOwnedProject } from '../projects/queries'
import { commentsTable } from './table'
import {
  MAX_COMMENTS,
  checkTarget,
  getComments,
  getOwnedComment,
} from './queries'
import type { Doc, Id, MutationCtx } from '../../lib/ctx'

const zTarget = {
  projectId: zid('projects'),
  kind: z.enum(['project', 'bot', 'command']),
  targetId: z.string().max(100),
}

/** Deletes every comment on a target, when the target goes. */
export const removeComments = async (
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  kind: Doc<'comments'>['kind'],
  targetId: string,
) => {
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
