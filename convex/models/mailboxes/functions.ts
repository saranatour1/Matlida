import { zid } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { internal } from '../../_generated/api'
import { env, internalAction, internalMutation } from '../../_generated/server'
import {
  authedAction,
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import { lookupDmarc, parseDmarc } from '../../lib/dmarc'
import { addressOf, zHandle } from '../../lib/handles'
import { getOwnedProject } from '../projects/functions'
import type { Id } from '../../_generated/dataModel'
import type { ActionCtx, QueryCtx } from '../../_generated/server'

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

/** The mail domain's DMARC, as last checked, for Connections. Null before the first check. */
const domainHealth = authedQuery({
  args: {},
  handler: async (ctx) => {
    const domain = env.MAIL_DOMAIN
    if (!domain) return null
    const check = await ctx.db
      .query('domainChecks')
      .withIndex('by_domain', (q) => q.eq('domain', domain))
      .unique()
    return check
      ? { domain, checkedAt: check.checkedAt, ...parseDmarc(check.records) }
      : { domain, checkedAt: null, ...parseDmarc([]) }
  },
})

const recordCheck = internalMutation({
  args: { domain: v.string(), records: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { domain, records }) => {
    const existing = await ctx.db
      .query('domainChecks')
      .withIndex('by_domain', (q) => q.eq('domain', domain))
      .unique()
    const check = { domain, records, checkedAt: Date.now() }
    if (existing) await ctx.db.replace('domainChecks', existing._id, check)
    else await ctx.db.insert('domainChecks', check)
    return null
  },
})

async function checkMailDomain(ctx: ActionCtx) {
  const domain = env.MAIL_DOMAIN
  if (!domain) return
  await ctx.runMutation(internal.api.mailboxes.recordCheck, {
    domain,
    records: await lookupDmarc(domain),
  })
}

/** Looks up the mail domain's DMARC record. Daily from `crons.ts`. */
const checkDomain = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await checkMailDomain(ctx)
    return null
  },
})

/** Connections' Check now. */
const checkDomainNow = authedAction({
  args: {},
  handler: async (ctx) => {
    await checkMailDomain(ctx)
  },
})

export const mailboxesApi = {
  mine,
  claim,
  release,
  domainHealth,
  recordCheck,
  checkDomain,
  checkDomainNow,
}
