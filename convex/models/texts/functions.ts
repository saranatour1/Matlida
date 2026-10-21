import { literals } from 'convex-helpers/validators'
import { ConvexError, v } from 'convex/values'
import { internal } from '../../_generated/api'
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import { authedMutation, authedQuery } from '../../lib/functions'
import { rateLimiter } from '../../lib/limits'
import { listTexts, photonKeys, sendText } from '../../lib/photon'
import schema from '../../schema'
import { getOwnedProject } from '../projects/functions'
import { ensureMainThread, getMembers } from '../threads/functions'
import { createAgent } from '../threads/lead'
import { spectrum } from './spectrum'
import type { Doc, Id } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'

/** Letters and digits that can't be confused with each other when typed. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const UNBIASED_BYTES = 256 - (256 % CODE_ALPHABET.length)

const CODE_TTL_MS = 10 * 60_000

function newCode() {
  let code = ''
  while (code.length < 6) {
    const [byte] = crypto.getRandomValues(new Uint8Array(1))
    if (byte < UNBIASED_BYTES)
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  }
  return code
}

/** A project's links: one per app, plus a pending code. */
export async function getLinks(
  ctx: Pick<QueryCtx, 'db'>,
  projectId: Id<'projects'>,
) {
  return await ctx.db
    .query('phoneLinks')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .order('desc')
    .take(10)
}

/** The project's most recently linked chat, where reminders text. */
export async function getLink(
  ctx: Pick<QueryCtx, 'db'>,
  projectId: Id<'projects'>,
) {
  const links = await getLinks(ctx, projectId)
  return links.find((l) => l.status === 'linked') ?? null
}

const links = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await getLinks(ctx, projectId)
  },
})

/** A fresh one-time code to send from any app, replacing an unused one. */
const startLink = authedMutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    for (const row of await getLinks(ctx, projectId)) {
      if (row.status === 'pending') await ctx.db.delete('phoneLinks', row._id)
    }
    const code = newCode()
    await ctx.db.insert('phoneLinks', {
      status: 'pending',
      ownerId: ctx.userId,
      projectId,
      code,
    })
    return code
  },
})

const unlink = authedMutation({
  args: { id: v.id('phoneLinks') },
  handler: async (ctx, { id }) => {
    const existing = await ctx.db.get('phoneLinks', id)
    if (!existing) throw new ConvexError('That link is already gone.')
    await getOwnedProject(ctx, ctx.userId, existing.projectId)
    await ctx.db.delete('phoneLinks', id)
  },
})

/**
 * Links the chat that sent a valid code. A chat talks to one project at a
 * time, and it replaces the project's earlier link on the same app.
 */
const claim = internalMutation({
  args: {
    code: v.string(),
    spaceId: v.string(),
    platform: v.string(),
    agentId: v.optional(v.string()),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { code, spaceId, platform, agentId }) => {
    const pending = await ctx.db
      .query('phoneLinks')
      .withIndex('by_code', (q) => q.eq('code', code.toUpperCase()))
      .unique()
    if (pending?.status !== 'pending') return null
    if (Date.now() - pending._creationTime > CODE_TTL_MS) return null
    const previous = await ctx.db
      .query('phoneLinks')
      .withIndex('by_spaceId', (q) => q.eq('spaceId', spaceId))
      .take(10)
    for (const row of previous) await ctx.db.delete('phoneLinks', row._id)
    for (const row of await getLinks(ctx, pending.projectId)) {
      if (
        row.status === 'linked' &&
        (row.platform ?? 'imessage') === platform
      ) {
        await ctx.db.delete('phoneLinks', row._id)
      }
    }
    await ctx.db.replace('phoneLinks', pending._id, {
      status: 'linked',
      ownerId: pending.ownerId,
      projectId: pending.projectId,
      spaceId,
      platform,
      agentId,
    })
    const project = await ctx.db.get('projects', pending.projectId)
    return project?.name ?? null
  },
})

/**
 * Whether a chat may send another message or try another code. Messages
 * from a linked chat count against its owner, so one person can't run up
 * the model from several apps; anything else counts against the chat.
 */
async function admitText(
  ctx: MutationCtx,
  spaceId: string,
  kind: 'message' | 'link',
) {
  if (kind === 'link') {
    const tries = await rateLimiter.limit(ctx, 'linkAttempt', {
      key: `space:${spaceId}`,
    })
    return tries.ok
  }
  const linked = await ctx.db
    .query('phoneLinks')
    .withIndex('by_spaceId', (q) => q.eq('spaceId', spaceId))
    .unique()
  const key =
    linked?.status === 'linked' ? `user:${linked.ownerId}` : `space:${spaceId}`
  const texts = await rateLimiter.limit(ctx, 'inboundText', { key })
  return texts.ok
}

/** Whether a link code is what `text` sends. */
const linkCode = (text: string) =>
  /^link\s+([a-z0-9]{6})$/i.exec(text.trim())?.[1]

const admit = internalMutation({
  args: { spaceId: v.string(), kind: literals('message', 'link') },
  returns: v.boolean(),
  handler: async (ctx, { spaceId, kind }) =>
    await admitText(ctx, spaceId, kind),
})

/**
 * Matilda's chat for messages from `spaceId`, started if needed: texts only
 * ever go to her. Null when the chat isn't linked.
 */
const forSpace = internalMutation({
  args: { spaceId: v.string() },
  returns: v.union(
    v.object({
      project: schema.doc('projects'),
      /** Who she can hand work to in her chat. */
      members: v.array(schema.doc('bots')),
      threadId: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { spaceId }) => {
    const linked = await ctx.db
      .query('phoneLinks')
      .withIndex('by_spaceId', (q) => q.eq('spaceId', spaceId))
      .unique()
    if (linked?.status !== 'linked') return null
    const project = await ctx.db.get('projects', linked.projectId)
    if (!project) return null
    const threadId = await ensureMainThread(ctx, project, null)
    const thread = await ctx.db
      .query('threads')
      .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
      .unique()
    return { project, members: await getMembers(ctx, thread), threadId }
  },
})

/**
 * What to send back to a message from `spaceId`. Links the chat, or lets its
 * assistant answer. Empty when nothing should be sent: a chat that's over
 * its limit while unlinked, or guessing codes.
 */
const answer = internalAction({
  args: {
    spaceId: v.string(),
    platform: v.string(),
    text: v.string(),
    agentId: v.optional(v.string()),
    /** Set when the limit was already checked as the message was recorded. */
    admitted: v.optional(v.boolean()),
  },
  returns: v.string(),
  handler: async (
    ctx,
    { spaceId, platform, text, agentId, admitted: checked },
  ): Promise<string> => {
    const code = linkCode(text)
    const admitted: boolean =
      checked ??
      (await ctx.runMutation(internal.api.texts.admit, {
        spaceId,
        kind: code ? 'link' : 'message',
      }))
    if (code) {
      if (!admitted) return ''
      const name: string | null = await ctx.runMutation(
        internal.api.texts.claim,
        { code, spaceId, platform, agentId },
      )
      return name
        ? `Linked to ${name}. Message me anytime.`
        : "That code didn't match. Get a new one on the Messaging page in Matilda."
    }
    const linked: {
      project: Doc<'projects'>
      members: Array<Doc<'bots'>>
      threadId: string
    } | null = await ctx.runMutation(internal.api.texts.forSpace, { spaceId })
    if (!linked) {
      return admitted
        ? "This chat isn't linked yet. Open Messaging in Matilda and send me the code it shows."
        : ''
    }
    if (!admitted) {
      return "You're sending a lot of messages. Give me a few minutes and try again."
    }
    const { project, members, threadId } = linked
    const agent = createAgent(project, { members, via: 'text' })
    const reply = await agent.generateText(
      ctx,
      { threadId, userId: project.ownerId },
      { prompt: text.trim() },
    )
    return reply.text
  },
})

/** Photon's batch handler: one turn per burst of texts from a phone. */
const respond = internalAction({
  args: {
    spaceId: v.string(),
    chainId: v.string(),
    messages: v.array(v.any()),
    carried: v.array(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const text = [...args.carried, ...args.messages]
      .map(textOf)
      .filter(Boolean)
      .join('\n')
    try {
      if (text) {
        const reply: string = await ctx
          .runAction(internal.api.texts.answer, {
            spaceId: args.spaceId,
            platform:
              (await spectrum.getSpace(ctx, { spaceId: args.spaceId }))
                ?.platform ?? 'imessage',
            text,
          })
          .catch((error: unknown) => {
            console.error(error)
            return 'Sorry, something went wrong. Try again in a minute.'
          })
        // A newer text may have superseded this turn while the lead was thinking.
        if (!reply || (await spectrum.isCancelled(ctx, args))) return null
        await spectrum.send(ctx, {
          spaceId: args.spaceId,
          chainId: args.chainId,
          content: { type: 'text', text: reply },
        })
      }
    } finally {
      await spectrum.completeChain(ctx, args)
    }
    return null
  },
})

/**
 * Records a message from `/photon/webhook` once, and schedules its answer.
 * False when it was already recorded: Photon retries a delivery it isn't
 * sure arrived.
 */
const received = internalMutation({
  args: {
    messageId: v.string(),
    spaceId: v.string(),
    platform: v.string(),
    agentId: v.string(),
    text: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { messageId, ...message }) => {
    const seen = await ctx.db
      .query('photonMessages')
      .withIndex('by_messageId', (q) => q.eq('messageId', messageId))
      .unique()
    if (seen) return false
    await ctx.db.insert('photonMessages', { messageId })
    // A chat is active: check every few seconds for a while, starting the loop unless it's running.
    const until = Date.now() + FAST_FOR_MS
    const poll = await ctx.db.query('telegramPolls').first()
    if (!poll) await ctx.db.insert('telegramPolls', { until })
    else await ctx.db.patch('telegramPolls', poll._id, { until })
    if (!poll || poll.until < Date.now()) {
      await ctx.scheduler.runAfter(FAST_POLL_MS, internal.api.texts.poll, {
        fast: true,
      })
    }
    // The limit is taken here, one message at a time, not in the replies that
    // run side by side, so two quick messages don't conflict on the same bucket.
    const admitted = await admitText(
      ctx,
      message.spaceId,
      linkCode(message.text) ? 'link' : 'message',
    )
    await ctx.scheduler.runAfter(0, internal.api.texts.replyOnPhoton, {
      messageId,
      admitted,
      ...message,
    })
    return true
  },
})

/** Answers a message from Photon's platform API in its chat, as the project's agent there. */
const replyOnPhoton = internalAction({
  args: {
    messageId: v.string(),
    spaceId: v.string(),
    platform: v.string(),
    agentId: v.string(),
    text: v.string(),
    admitted: v.boolean(),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { messageId, spaceId, platform, agentId, text, admitted },
  ) => {
    const keys = photonKeys(env)
    if (!keys) return null
    const reply: string = await ctx
      .runAction(internal.api.texts.answer, {
        spaceId,
        platform,
        text,
        agentId,
        admitted,
      })
      .catch((error: unknown) => {
        console.error(error)
        return 'Sorry, something went wrong. Try again in a minute.'
      })
    if (!reply) return null
    await sendText(keys, {
      spaceId,
      senderId: agentId,
      text: reply,
      key: `reply:${messageId}`,
    })
    return null
  },
})

/** How far back each Telegram check looks. Photon's list is eventually consistent, and `received` skips repeats. */
const TELEGRAM_LOOKBACK_MS = 3 * 60_000

/** While a Telegram chat is active, the check runs this often, for this long after the last message. */
const FAST_POLL_MS = 3_000
const FAST_FOR_MS = 2 * 60_000

/** Until when the fast Telegram check should keep going, or 0. */
const pollingUntil = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) =>
    (await ctx.db.query('telegramPolls').first())?.until ?? 0,
})

/**
 * Checks Photon for Telegram texts: every minute from `crons.ts`, and every
 * few seconds (`fast`) while a chat is active, since Photon's webhook doesn't
 * deliver them. Each goes through `received`, which answers a message once
 * however it arrived.
 */
const poll = internalAction({
  args: { fast: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { fast }) => {
    const keys = photonKeys(env)
    if (!keys) return null
    const since = new Date(Date.now() - TELEGRAM_LOOKBACK_MS).toISOString()
    for (const message of await listTexts(keys, 'telegram', since)) {
      await ctx.runMutation(internal.api.texts.received, {
        messageId: message.id,
        spaceId: message.space.id,
        platform: 'telegram',
        agentId: message.receivedBy.id,
        text: message.content.text,
      })
    }
    if (fast) {
      const until: number = await ctx.runQuery(
        internal.api.texts.pollingUntil,
        {},
      )
      if (Date.now() < until) {
        await ctx.scheduler.runAfter(FAST_POLL_MS, internal.api.texts.poll, {
          fast: true,
        })
      }
    }
    return null
  },
})

/** The text of an inbound Photon message, or '' for anything else (photos, reactions). */
function textOf(message: unknown) {
  const content = (message as { content?: { type?: unknown; text?: unknown } })
    .content
  return content?.type === 'text' && typeof content.text === 'string'
    ? content.text
    : ''
}

export const textsApi = {
  links,
  startLink,
  unlink,
  claim,
  forSpace,
  admit,
  answer,
  respond,
  received,
  replyOnPhoton,
  pollingUntil,
  poll,
}
