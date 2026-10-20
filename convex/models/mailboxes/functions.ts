import { zid } from 'convex-helpers/server/zod4'
import { ConvexError } from 'convex/values'
import { env } from '../../_generated/server'
import {
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import { addressOf, zHandle } from '../../lib/handles'
import { getOwnedProject } from '../projects/functions'
import type { Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'

/** The user's mailbox, or null before they claim a handle. */
export async function getMailbox(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
) {
  return await ctx.db
    .query('mailboxes')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
}

/**
 * Your assistant address and where it answers, with the address replies go
 * to. `domain` is null until the deployment has `MAIL_DOMAIN`.
 */
const mine = authedQuery({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db.get('users', ctx.userId)
    const mailbox = await getMailbox(ctx, ctx.userId)
    const domain = env.MAIL_DOMAIN || null
    return {
      domain,
      /** Your verified sign-in address: the only one the assistants write to. */
      email: user?.email ?? null,
      mailbox: mailbox && {
        _id: mailbox._id,
        handle: mailbox.handle,
        projectId: mailbox.projectId,
        address: domain ? addressOf(mailbox.handle, domain) : null,
      },
    }
  },
})

/**
 * Claims `handle@MAIL_DOMAIN` for you, answered by `projectId`'s assistants.
 * Claiming again renames your address or moves it to another workspace.
 */
const claim = zAuthedMutation({
  args: { projectId: zid('projects'), handle: zHandle },
  handler: async (ctx, { projectId, handle }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    if (!env.MAIL_DOMAIN) {
      throw new ConvexError('Email isn’t set up on this deployment yet.')
    }
    const user = await ctx.db.get('users', ctx.userId)
    if (!user?.email) {
      throw new ConvexError(
        'Verify your sign-in email first. Your assistants only write to it.',
      )
    }
    const existing = await getMailbox(ctx, ctx.userId)
    const taken = await ctx.db
      .query('mailboxes')
      .withIndex('by_handle', (q) => q.eq('handle', handle))
      .unique()
    if (taken && taken._id !== existing?._id) {
      throw new ConvexError('That handle is taken. Pick another.')
    }
    if (existing) {
      // The email chats belong to the old workspace, so the new one starts its own.
      const moved = existing.projectId !== projectId
      await ctx.db.patch('mailboxes', existing._id, {
        handle,
        projectId,
        ...(moved && { threadId: undefined, inboxThreadId: undefined }),
      })
      return existing._id
    }
    return await ctx.db.insert('mailboxes', {
      userId: ctx.userId,
      projectId,
      handle,
    })
  },
})

/** Gives your address up. Mail to it is dropped from then on. */
const release = authedMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await getMailbox(ctx, ctx.userId)
    if (existing) await ctx.db.delete('mailboxes', existing._id)
  },
})

export const mailboxesApi = { mine, claim, release }
