import { saveMessage } from '@convex-dev/agent'
import { v } from 'convex/values'
import { components, internal } from '../../_generated/api'
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import { rateLimiter } from '../../lib/limits'
import { stripQuotes } from '../../lib/mail'
import { listEmails, plainText, replyByEmail } from '../../lib/photon'
import schema from '../../schema'
import { getBots } from '../bots/functions'
import { startThread } from '../threads/functions'
import { createLead } from '../threads/lead'
import { emailsTable } from './table'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'

/** Photon's message list is eventually consistent, so each check looks back this far and skips what's recorded. */
const LOOKBACK_MS = 10 * 60_000

/** When the newest recorded email arrived, or null before the first. */
const latest = internalQuery({
  args: {},
  returns: v.union(v.number(), v.null()),
  handler: async (ctx) => {
    const newest = await ctx.db
      .query('emails')
      .withIndex('by_receivedAt')
      .order('desc')
      .first()
    return newest?.receivedAt ?? null
  },
})

/** The mailbox's email chat (`threadId`) or inbox chat (`inboxThreadId`), started on first use. */
async function chatFor(
  ctx: MutationCtx,
  mailbox: Doc<'mailboxes'>,
  which: 'threadId' | 'inboxThreadId',
) {
  const existing = mailbox[which]
  if (existing) return existing
  const project = await ctx.db.get('projects', mailbox.projectId)
  const threadId = await startThread(ctx, {
    projectId: mailbox.projectId,
    kind: 'chat',
    title:
      which === 'threadId'
        ? `${project?.name ?? 'Matilda'} · Email`
        : 'Email inbox',
    userId: mailbox.userId,
  })
  await ctx.db.patch('mailboxes', mailbox._id, { [which]: threadId })
  return threadId
}

/**
 * Records one email, once. Mail from the mailbox owner's verified address is
 * returned for the lead to answer; anyone else's is posted in the owner's
 * inbox chat, unanswered, so it never reaches the lead's own conversation.
 */
const receive = internalMutation({
  args: {
    messageId: v.string(),
    receivedAt: v.number(),
    to: v.string(),
    from: v.string(),
    fromName: v.optional(v.string()),
    subject: v.string(),
    text: v.string(),
    spam: v.boolean(),
  },
  returns: v.union(
    v.object({
      project: schema.doc('projects'),
      bots: v.array(schema.doc('bots')),
      threadId: v.string(),
      owner: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const seen = await ctx.db
      .query('emails')
      .withIndex('by_messageId', (q) => q.eq('messageId', args.messageId))
      .unique()
    if (seen) return null
    const record = (status: Doc<'emails'>['status']) =>
      ctx.db.insert('emails', {
        messageId: args.messageId,
        receivedAt: args.receivedAt,
        status,
      })

    const [handle, domain] = args.to.toLowerCase().split('@')
    const mailbox =
      domain === env.MAIL_DOMAIN?.toLowerCase()
        ? await ctx.db
            .query('mailboxes')
            .withIndex('by_handle', (q) => q.eq('handle', handle))
            .unique()
        : null
    const owner = mailbox && (await ctx.db.get('users', mailbox.userId))
    const project = mailbox && (await ctx.db.get('projects', mailbox.projectId))
    if (!mailbox || !owner || !project) {
      await record('ignored')
      return null
    }

    const fromOwner =
      !args.spam &&
      !!owner.email &&
      args.from.toLowerCase() === owner.email.toLowerCase()
    if (fromOwner && owner.email) {
      // Photon can't tell a forged From from a real one, and an out-of-office
      // reply could loop, so answers per owner are capped.
      const limit = await rateLimiter.limit(ctx, 'inboundEmail', {
        key: `user:${owner._id}`,
      })
      if (!limit.ok) {
        const threadId = await chatFor(ctx, mailbox, 'threadId')
        await saveMessage(ctx, components.agent, {
          threadId,
          message: {
            role: 'user',
            content: [args.subject, args.text].filter(Boolean).join('\n\n'),
          },
        })
        await saveMessage(ctx, components.agent, {
          threadId,
          message: {
            role: 'assistant',
            content:
              '_Not answered by email: too many emails in a short time. Try again in a few minutes._',
          },
        })
        await record('limited')
        return null
      }
      await record('answering')
      return {
        project,
        bots: await getBots(ctx, project._id),
        threadId: await chatFor(ctx, mailbox, 'threadId'),
        owner: owner.email,
      }
    }

    const sender = args.fromName ? `${args.fromName} <${args.from}>` : args.from
    await saveMessage(ctx, components.agent, {
      threadId: await chatFor(ctx, mailbox, 'inboxThreadId'),
      message: {
        role: 'assistant',
        content: `📨 **${sender}**${args.spam ? ' _(marked as spam)_' : ''}\n**${args.subject || '(no subject)'}**\n\n${args.text || '_(no text)_'}`,
      },
    })
    await record('shown')
    return null
  },
})

/** Marks an answered email, and says in its chat when the reply couldn't be sent. */
const settle = internalMutation({
  args: {
    messageId: v.string(),
    status: emailsTable.validator.fields.status,
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { messageId, status, threadId }) => {
    const row = await ctx.db
      .query('emails')
      .withIndex('by_messageId', (q) => q.eq('messageId', messageId))
      .unique()
    if (row) await ctx.db.patch('emails', row._id, { status })
    if (status === 'failed') {
      await saveMessage(ctx, components.agent, {
        threadId,
        message: {
          role: 'assistant',
          content: "_This reply couldn't be sent by email._",
        },
      })
    }
    return null
  },
})

/**
 * Checks Photon for new email, every minute from `crons.ts`. Each email is
 * recorded, and the owner's are answered by email in the same thread, to the
 * owner's verified address only.
 */
const poll = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const keys = {
      projectId: env.PHOTON_PROJECT_ID,
      apiKey: env.PHOTON_API_KEY,
    }
    if (!keys.projectId || !keys.apiKey || !env.MAIL_DOMAIN) return null
    const photon = { projectId: keys.projectId, apiKey: keys.apiKey }
    const newest: number | null = await ctx.runQuery(
      internal.api.emails.latest,
      {},
    )
    const since = new Date((newest ?? Date.now()) - LOOKBACK_MS).toISOString()

    for (const email of await listEmails(photon, since)) {
      const { receivedBy } = email
      if (!receivedBy) continue
      const subject = email.content.metadata?.email?.subject ?? ''
      const text = stripQuotes(plainText(email.content))
      const turn: {
        project: Doc<'projects'>
        bots: Array<Doc<'bots'>>
        threadId: string
        owner: string
      } | null = await ctx.runMutation(internal.api.emails.receive, {
        messageId: email.id,
        receivedAt: Date.parse(email.createdAt),
        to: receivedBy.handle,
        from: email.sentBy.handle,
        fromName: email.sentBy.metadata?.displayName,
        subject,
        text,
        spam: email.metadata?.isSpam ?? false,
      })
      if (!turn) continue

      let status: 'answered' | 'failed' = 'answered'
      try {
        const { agent, tools } = createLead(turn.project, turn.bots, {
          via: 'email',
        })
        const reply = await agent.generateText(
          ctx,
          { threadId: turn.threadId, userId: turn.project.ownerId },
          {
            prompt:
              [subject, text].filter(Boolean).join('\n\n') || '(empty email)',
            tools,
          },
        )
        await replyByEmail(
          photon,
          { ...email, receivedBy },
          turn.owner,
          reply.text,
        )
      } catch (error) {
        console.error(error)
        status = 'failed'
      }
      await ctx.runMutation(internal.api.emails.settle, {
        messageId: email.id,
        status,
        threadId: turn.threadId,
      })
    }
    return null
  },
})

export const emailsApi = { latest, receive, settle, poll }
