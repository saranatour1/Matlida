import {
  WorkflowManager,
  cleanup,
  start,
  vResultValidator,
  vWorkflowId,
} from '@convex-dev/workflow'
import { v } from 'convex/values'
import { components, internal } from '../../_generated/api'
import { env, internalAction, internalMutation } from '../../_generated/server'
import { addressee } from '../../lib/addressee'
import { addressOf, handleOf } from '../../lib/handles'
import { rateLimiter } from '../../lib/limits'
import {
  bareAddress,
  replyReferences,
  replySubject,
  stripQuotes,
  stripReplyPrefix,
} from '../../lib/mail'
import { fetchReceived, resend } from '../../lib/resend'
import schema from '../../schema'
import { getBots } from '../bots/functions'
import { startThread } from '../threads/functions'
import { createBot, createLead } from '../threads/lead'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'

/**
 * Inbound email, as a durable pipeline: Resend's webhook records the email's
 * ids and starts `answerEmail`, which fetches the message's facts, verifies
 * the sender, has the right assistant reply, and sends the reply to the
 * mailbox's owner. Each step retries on its own; a rejected email gets no
 * reply and is recorded with a reason only.
 */
export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 5,
    retryActionsByDefault: true,
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
  },
})

/** The claimed mailboxes among `recipients`, by the handle at MAIL_DOMAIN. At most the first 20 recipients count. */
async function mailboxesFor(
  ctx: Pick<MutationCtx, 'db'>,
  recipients: Array<string>,
  domain: string,
) {
  const found: Array<Doc<'mailboxes'>> = []
  for (const recipient of recipients.slice(0, 20)) {
    const handle = handleOf(bareAddress(recipient) ?? '', domain)
    if (!handle) continue
    const mailbox = await ctx.db
      .query('mailboxes')
      .withIndex('by_handle', (q) => q.eq('handle', handle))
      .unique()
    if (mailbox && !found.some((m) => m._id === mailbox._id))
      found.push(mailbox)
  }
  return found
}

/**
 * Records a received email and starts its workflow, once. Redeliveries of the
 * same email, by Resend's id or by Message-ID, are acknowledged and dropped,
 * and so is mail to a handle nobody has claimed, before it costs a fetch.
 */
const receive = internalMutation({
  args: {
    emailId: v.string(),
    messageId: v.union(v.string(), v.null()),
    to: v.array(v.string()),
  },
  returns: v.object({ started: v.boolean() }),
  handler: async (
    ctx,
    { emailId, messageId, to },
  ): Promise<{ started: boolean }> => {
    const domain = env.MAIL_DOMAIN
    if (!domain || (await mailboxesFor(ctx, to, domain)).length === 0) {
      console.warn(`Inbound email ${emailId} dropped: unknown_mailbox`)
      return { started: false }
    }
    const seen = await ctx.db
      .query('inboundEmails')
      .withIndex('by_emailId', (q) => q.eq('emailId', emailId))
      .unique()
    if (seen) return { started: false }
    if (messageId) {
      const sameMessage = await ctx.db
        .query('inboundEmails')
        .withIndex('by_messageId', (q) => q.eq('messageId', messageId))
        .first()
      if (sameMessage) return { started: false }
    }
    const id = await ctx.db.insert('inboundEmails', {
      emailId,
      messageId: messageId ?? undefined,
      status: 'received',
    })
    const workflowId: string = await start(
      ctx,
      internal.api.inbound.answerEmail,
      { id, emailId },
      { onComplete: internal.api.inbound.record, context: { id } },
    )
    await ctx.db.patch('inboundEmails', id, { workflowId })
    return { started: true }
  },
})

const vFacts = {
  from: v.string(),
  to: v.array(v.string()),
  cc: v.array(v.string()),
  authentication: v.union(
    v.object({ spf: v.string(), dkim: v.string(), dmarc: v.string() }),
    v.null(),
  ),
  messageId: v.union(v.string(), v.null()),
  autoSubmitted: v.boolean(),
}

/** The facts needed to verify a received email, without its body. */
const facts = internalAction({
  args: { emailId: v.string() },
  returns: v.object(vFacts),
  handler: async (_ctx, { emailId }) => {
    const { from, to, cc, authentication, messageId, autoSubmitted } =
      await fetchReceived(emailId)
    return { from, to, cc, authentication, messageId, autoSubmitted }
  },
})

/**
 * Accepts an email only when it's to a claimed handle whose owner's verified
 * address is the From, and the receiving server saw an aligned DKIM pass
 * (`dkim: pass`, which Resend only reports when the signing domain matches
 * the From domain) with DMARC `pass`, or `gray` when the sender's domain
 * publishes no policy or `p=none`, as Gmail does. Mail from machines
 * (out-of-office, bounces) is never answered. Anything else is rejected with
 * a reason and gets no reply. Checks the owner's rate limit last, so
 * strangers can't use it up.
 */
const verify = internalMutation({
  args: { id: v.id('inboundEmails'), ...vFacts },
  returns: v.union(v.object({ mailboxId: v.id('mailboxes') }), v.null()),
  handler: async (
    ctx,
    { id, from, to, cc, authentication, messageId, autoSubmitted },
  ) => {
    const row = await ctx.db.get('inboundEmails', id)
    if (row?.status !== 'received') return null
    const reject = async (reason: string) => {
      await ctx.db.patch('inboundEmails', id, { status: 'rejected', reason })
      console.warn(`Inbound email ${row.emailId} rejected: ${reason}`)
      return null
    }
    const domain = env.MAIL_DOMAIN
    if (!domain) return await reject('no_domain')
    const mailboxes = await mailboxesFor(ctx, [...to, ...cc], domain)
    if (mailboxes.length === 0) return await reject('unknown_mailbox')
    if (autoSubmitted) return await reject('auto_submitted')
    // The sender's own assistant answers, even when others were written to as well.
    const sender = bareAddress(from)
    let owner: Doc<'users'> | null = null
    let mailbox: Doc<'mailboxes'> | null = null
    for (const candidate of mailboxes) {
      const user = await ctx.db.get('users', candidate.userId)
      if (user?.email && user.email.toLowerCase() === sender) {
        owner = user
        mailbox = candidate
        break
      }
    }
    if (!owner || !mailbox) return await reject('from_mismatch')
    if (!authentication) return await reject('no_auth_results')
    if (authentication.dkim !== 'pass') return await reject('dkim_unaligned')
    if (authentication.dmarc !== 'pass' && authentication.dmarc !== 'gray') {
      return await reject('dmarc_fail')
    }
    if (messageId) {
      const sameMessage = await ctx.db
        .query('inboundEmails')
        .withIndex('by_messageId', (q) => q.eq('messageId', messageId))
        .first()
      if (sameMessage && sameMessage._id !== id)
        return await reject('duplicate')
      if (!row.messageId) await ctx.db.patch('inboundEmails', id, { messageId })
    }
    const limit = await rateLimiter.limit(ctx, 'inboundEmail', {
      key: owner._id,
    })
    if (!limit.ok) return await reject('rate_limited')
    await ctx.db.patch('inboundEmails', id, { mailboxId: mailbox._id })
    return { mailboxId: mailbox._id }
  },
})

/** This mailbox's chat with `bot` (the lead when null), started on first use. */
async function threadFor(
  ctx: MutationCtx,
  mailbox: Doc<'mailboxes'>,
  project: Doc<'projects'>,
  bot: Doc<'bots'> | null,
) {
  const existing = bot
    ? mailbox.botThreads?.find((t) => t.botId === bot._id)?.threadId
    : mailbox.threadId
  if (existing) return existing
  const threadId = await startThread(ctx, {
    projectId: project._id,
    kind: 'chat',
    title: `${(bot ?? project).name} · Email`,
    botId: bot?._id,
    userId: mailbox.userId,
  })
  await ctx.db.patch(
    'mailboxes',
    mailbox._id,
    bot
      ? {
          botThreads: [
            ...(mailbox.botThreads ?? []),
            { botId: bot._id, threadId },
          ],
        }
      : { threadId },
  )
  return threadId
}

/**
 * Who answers an email, like texting: `@name` at the start of the subject or
 * the first line picks an assistant for this and later emails. Returns the
 * subject and first line without the tag, and the thread to reply in.
 */
const route = internalMutation({
  args: {
    mailboxId: v.id('mailboxes'),
    subject: v.string(),
    firstLine: v.string(),
  },
  returns: v.union(
    v.object({
      project: schema.doc('projects'),
      bots: v.array(schema.doc('bots')),
      bot: v.union(schema.doc('bots'), v.null()),
      /** Null when `@name` named nobody here. */
      threadId: v.union(v.string(), v.null()),
      subject: v.string(),
      firstLine: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { mailboxId, subject: rawSubject, firstLine }) => {
    const mailbox = await ctx.db.get('mailboxes', mailboxId)
    const project = mailbox && (await ctx.db.get('projects', mailbox.projectId))
    if (!mailbox || !project) return null
    const bots = await getBots(ctx, project._id)
    const people = [
      { name: project.name, bot: null },
      ...bots.map((bot) => ({ name: bot.name, bot })),
    ]
    let subject = stripReplyPrefix(rawSubject)
    let line = firstLine
    let botId = mailbox.activeBotId
    // The first line wins: a thread's subject keeps its tag for good.
    const tagged = line.trimStart().startsWith('@')
      ? { in: 'line' as const, tag: line.trimStart() }
      : subject.startsWith('@')
        ? { in: 'subject' as const, tag: subject }
        : null
    if (tagged) {
      const named = addressee(tagged.tag, people)
      if (!named) {
        return { project, bots, bot: null, threadId: null, subject, firstLine }
      }
      botId = named.bot?._id
      if (tagged.in === 'subject') subject = named.rest
      else line = named.rest
      if (botId !== mailbox.activeBotId) {
        await ctx.db.patch('mailboxes', mailbox._id, { activeBotId: botId })
      }
    }
    const bot = bots.find((b) => b._id === botId) ?? null
    const threadId = await threadFor(ctx, mailbox, project, bot)
    return { project, bots, bot, threadId, subject, firstLine: line }
  },
})

const NO_TEXT_REPLY =
  "I can only read the plain-text part of an email, and this one didn't have one. Send it again as plain text."

/**
 * The reply to a verified email: the assistant it's addressed to answers
 * the plain-text part, with quoted history cut, in its email thread.
 * Returns the reply and what's needed to send it in the same thread.
 */
const reply = internalAction({
  args: {
    id: v.id('inboundEmails'),
    emailId: v.string(),
    mailboxId: v.id('mailboxes'),
  },
  returns: v.object({
    text: v.string(),
    /** The assistant's name, for the From line. */
    from: v.string(),
    subject: v.string(),
    messageId: v.union(v.string(), v.null()),
    references: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx,
    { emailId, mailboxId },
  ): Promise<{
    text: string
    from: string
    subject: string
    messageId: string | null
    references: string | null
  }> => {
    const message = await fetchReceived(emailId)
    const written = stripQuotes(message.text ?? '')
    const [firstLine = '', ...rest] = written.split('\n')
    const routed: {
      project: Doc<'projects'>
      bots: Array<Doc<'bots'>>
      bot: Doc<'bots'> | null
      threadId: string | null
      subject: string
      firstLine: string
    } | null = await ctx.runMutation(internal.api.inbound.route, {
      mailboxId,
      subject: message.subject,
      firstLine,
    })
    if (!routed) throw new Error(`Mailbox ${mailboxId} is gone`)
    const { project, bots, bot, threadId, subject } = routed
    const names = [project.name, ...bots.map((b) => b.name)].join(', ')
    const base = {
      from: (bot ?? project).name,
      subject: message.subject,
      messageId: message.messageId,
      references: message.references,
    }
    if (!threadId) {
      return {
        ...base,
        from: project.name,
        text: `There's no one by that name here. You can email ${names}: start the subject or the first line with @name.`,
      }
    }
    if (message.text === null || !message.text.trim()) {
      return { ...base, text: NO_TEXT_REPLY }
    }
    const body = [routed.firstLine, ...rest].join('\n').trim()
    const prompt = subject
      ? `Subject: ${subject}${body ? `\n\n${body}` : ''}`
      : body
    const { agent, tools } = bot
      ? createBot(project, bot, [], { via: 'email' })
      : createLead(project, bots, { via: 'email' })
    const result = await agent.generateText(
      ctx,
      { threadId, userId: project.ownerId },
      { prompt, tools },
    )
    return { ...base, text: result.text }
  },
})

/** A display name that can't break out of the From header. */
function fromName(name: string) {
  return `"${name.replace(/["\\<>\r\n]/g, '')}"`
}

/**
 * Sends the reply to the mailbox owner's verified address, from the
 * assistant at the owner's handle, threaded under the email. The recipient
 * comes from the mailbox here, never from the email. Records the reply.
 */
const send = internalMutation({
  args: {
    id: v.id('inboundEmails'),
    text: v.string(),
    from: v.string(),
    subject: v.string(),
    messageId: v.union(v.string(), v.null()),
    references: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { id, text, from, subject, messageId, references }) => {
    const row = await ctx.db.get('inboundEmails', id)
    if (row?.status !== 'received' || !row.mailboxId) return null
    const mailbox = await ctx.db.get('mailboxes', row.mailboxId)
    const owner = mailbox && (await ctx.db.get('users', mailbox.userId))
    const domain = env.MAIL_DOMAIN
    if (!mailbox || !owner?.email || !domain) {
      await ctx.db.patch('inboundEmails', id, {
        status: 'failed',
        reason: 'owner_gone',
      })
      return null
    }
    const headers = [
      // RFC 3834: tells the owner's own auto-responders not to answer this.
      { name: 'Auto-Submitted', value: 'auto-replied' },
      ...(messageId
        ? [
            { name: 'In-Reply-To', value: messageId },
            {
              name: 'References',
              value: replyReferences(references ?? undefined, messageId),
            },
          ]
        : []),
    ]
    const replyId = await resend.sendEmail(ctx, {
      from: `${fromName(from)} <${addressOf(mailbox.handle, domain)}>`,
      to: owner.email,
      subject: replySubject(subject),
      text,
      headers,
      idempotencyKey: `inbound:${row.emailId}`,
    })
    await ctx.db.patch('inboundEmails', id, { status: 'answered', replyId })
    return null
  },
})

/**
 * Runs when the workflow ends. Marks an email that never got its reply, and
 * deletes the workflow's journal.
 */
const record = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ id: v.id('inboundEmails') }),
  },
  returns: v.null(),
  handler: async (ctx, { workflowId, result, context }) => {
    const row = await ctx.db.get('inboundEmails', context.id)
    if (row && row.status === 'received' && result.kind !== 'success') {
      const reason = result.kind === 'failed' ? 'workflow_error' : 'cancelled'
      await ctx.db.patch('inboundEmails', context.id, {
        status: 'failed',
        reason,
      })
      console.error(
        `Inbound email ${row.emailId} failed: ${result.kind === 'failed' ? result.error.slice(0, 200) : reason}`,
      )
    }
    // The journal held the addresses and the reply; the row keeps only ids.
    await cleanup(ctx, components.workflow, workflowId)
    return null
  },
})

const DAY_MS = 24 * 60 * 60 * 1000

/** Drops the Resend component's record of mail older than a week, replies included. Run daily by `crons.ts`. */
const forgetOldMail = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runMutation(components.resend.lib.cleanupOldEmails, {
      olderThan: 7 * DAY_MS,
    })
    await ctx.runMutation(components.resend.lib.cleanupAbandonedEmails, {
      olderThan: 7 * DAY_MS,
    })
    return null
  },
})

/**
 * Fetch the facts, verify, reply, send. The fetch retries for a couple of
 * minutes, since Resend's API can be slow or rate limited; the reply runs at
 * most once, so a retry can't bill twice or save the prompt twice.
 */
const answerEmail = workflow
  .define({ args: { id: v.id('inboundEmails'), emailId: v.string() } })
  .handler(async (step, { id, emailId }): Promise<void> => {
    const fetched = await step.runAction(
      internal.api.inbound.facts,
      { emailId },
      {
        name: 'fetch',
        retry: { maxAttempts: 5, initialBackoffMs: 5000, base: 2 },
      },
    )
    const verified = await step.runMutation(
      internal.api.inbound.verify,
      { id, ...fetched },
      { name: 'verify' },
    )
    if (!verified) return
    const answer = await step.runAction(
      internal.api.inbound.reply,
      { id, emailId, mailboxId: verified.mailboxId },
      { name: 'reply', retry: false },
    )
    await step.runMutation(
      internal.api.inbound.send,
      { id, ...answer },
      { name: 'send' },
    )
  })

export const inboundApi = {
  receive,
  facts,
  verify,
  route,
  reply,
  send,
  record,
  forgetOldMail,
  answerEmail,
}
