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
import { downloadAttachment, photonKeys, sendText } from '../../lib/photon'
import schema from '../../schema'
import { getOwnedProject } from '../projects/queries'
import { budgetMessage } from '../../lib/budget'
import { ensureMainThread } from '../threads/functions'
import { getMembers } from '../threads/queries'
import { createAgent } from '../threads/lead'
import { transcribeBytes } from '../threads/chat'
import { commandName, resolveCommand } from '../commands/queries'
import { spectrum } from './spectrum'
import { getLinks } from './queries'
import type { PhotonKeys } from '../../lib/photon'
import type { ActionCtx, Doc, Id, MutationCtx } from '../../lib/ctx'

/** Letters and digits that can't be confused with each other when typed. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const UNBIASED_BYTES = 256 - (256 % CODE_ALPHABET.length)

const CODE_TTL_MS = 10 * 60_000

const newCode = () => {
  let code = ''
  while (code.length < 6) {
    const [byte] = crypto.getRandomValues(new Uint8Array(1))
    if (byte < UNBIASED_BYTES)
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  }
  return code
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
const admitText = async (
  ctx: MutationCtx,
  spaceId: string,
  kind: 'message' | 'link',
) => {
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

/**
 * Keeps `text` for `find_texts` and returns Matilda's chat for messages from
 * `spaceId`, started if needed: texts only ever go to her. Null when the
 * chat isn't linked.
 */
const forSpace = internalMutation({
  args: { spaceId: v.string(), platform: v.string(), text: v.string() },
  returns: v.union(
    v.object({
      project: schema.doc('projects'),
      /** Who she can hand work to in her chat. */
      members: v.array(schema.doc('bots')),
      threadId: v.string(),
      /** The command the text runs, like in the app. An unknown `/name` (Telegram's /start) is plain text. */
      command: v.union(
        v.object({
          name: v.string(),
          markdown: v.optional(v.string()),
          storageId: v.optional(v.id('_storage')),
        }),
        v.null(),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, { spaceId, platform, text }) => {
    const linked = await ctx.db
      .query('phoneLinks')
      .withIndex('by_spaceId', (q) => q.eq('spaceId', spaceId))
      .unique()
    if (linked?.status !== 'linked') return null
    const project = await ctx.db.get('projects', linked.projectId)
    if (!project) return null
    if (text.trim()) {
      await ctx.db.insert('receivedTexts', {
        userId: linked.ownerId,
        projectId: project._id,
        platform: linked.platform ?? platform,
        text: text.trim(),
      })
    }
    const threadId = await ensureMainThread(ctx, project, null)
    const name = commandName(text.trim())
    return {
      project,
      members: await getMembers(ctx, project, null),
      threadId,
      command: name ? await resolveCommand(ctx, project._id, name) : null,
    }
  },
})

/** Who a chat is linked to, or null. */
const linkedOwner = internalQuery({
  args: { spaceId: v.string() },
  returns: v.union(v.id('users'), v.null()),
  handler: async (ctx, { spaceId }) => {
    const linked = await ctx.db
      .query('phoneLinks')
      .withIndex('by_spaceId', (q) => q.eq('spaceId', spaceId))
      .unique()
    return linked?.status === 'linked' ? linked.ownerId : null
  },
})

/**
 * What to send back to a message from `spaceId`. Links the chat, or lets its
 * assistant answer. Empty when nothing should be sent: a chat that's over
 * its limit while unlinked, or guessing codes. `admitted` is the limit,
 * taken by the mutation that recorded the message. A plain function, so
 * both reply actions run it in place instead of calling another action.
 */
const answer = async (
  ctx: ActionCtx,
  {
    spaceId,
    platform,
    text,
    agentId,
    admitted,
  }: {
    spaceId: string
    platform: string
    text: string
    agentId?: string
    admitted: boolean
  },
): Promise<string> => {
  const code = linkCode(text)
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
    command: {
      name: string
      markdown?: string
      storageId?: Id<'_storage'>
    } | null
  } | null = await ctx.runMutation(internal.api.texts.forSpace, {
    spaceId,
    platform,
    // Texts over the limit aren't kept for find_texts.
    text: admitted ? text : '',
  })
  if (!linked) {
    return admitted
      ? "This chat isn't linked yet. Open Messaging in Matilda and send me the code it shows."
      : ''
  }
  if (!admitted) {
    return "You're sending a lot of messages. Give me a few minutes and try again."
  }
  const { project, members, threadId, command } = linked
  const markdown =
    command?.markdown ??
    (command?.storageId &&
      (await (await ctx.storage.get(command.storageId))?.text()))
  const agent = createAgent(ctx, project, {
    members,
    via: 'text',
    command: command && markdown ? { name: command.name, markdown } : undefined,
  })
  const reply = await agent.generateText(
    ctx,
    { threadId, userId: project.ownerId },
    { prompt: text.trim() },
  )
  return reply.text
}

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
    /** A voice note's attachment, heard before answering. */
    voiceId: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, { messageId, ...message }) => {
    const seen = await ctx.db
      .query('photonMessages')
      .withIndex('by_messageId', (q) => q.eq('messageId', messageId))
      .unique()
    if (seen) return false
    await ctx.db.insert('photonMessages', { messageId })
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

/**
 * What a linked chat's voice note says, charged to its owner, or null for
 * an unlinked chat: a stranger can't run up transcription.
 */
const hear = async (
  ctx: ActionCtx,
  keys: PhotonKeys,
  spaceId: string,
  voiceId: string,
) => {
  const ownerId = await ctx.runQuery(internal.api.texts.linkedOwner, {
    spaceId,
  })
  if (!ownerId) return null
  const audio = await downloadAttachment(keys, voiceId)
  return (await transcribeBytes(ctx, ownerId, audio)).text
}

/** Answers a message from Photon's platform API in its chat, as the project's agent there. */
const replyOnPhoton = internalAction({
  args: {
    messageId: v.string(),
    spaceId: v.string(),
    platform: v.string(),
    agentId: v.string(),
    text: v.string(),
    voiceId: v.optional(v.string()),
    admitted: v.boolean(),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { messageId, spaceId, platform, agentId, text, voiceId, admitted },
  ) => {
    const keys = photonKeys(env)
    if (!keys) return null
    const reply = await (async () => {
      const heard =
        voiceId && admitted ? await hear(ctx, keys, spaceId, voiceId) : null
      if (heard === '') {
        return "I couldn't make out that voice message. Try again, or type it."
      }
      return await answer(ctx, {
        spaceId,
        platform,
        text: heard ?? text,
        agentId,
        admitted,
      })
    })().catch((error: unknown) => {
      console.error(error)
      return (
        budgetMessage(error) ??
        'Sorry, something went wrong. Try again in a minute.'
      )
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

/** `userId`'s texts to the lead matching `query`, best first, optionally from one app. For `find_texts`. */
const search = internalQuery({
  args: {
    userId: v.id('users'),
    query: v.string(),
    platform: v.optional(v.string()),
  },
  returns: v.array(
    v.object({ platform: v.string(), text: v.string(), sentAt: v.number() }),
  ),
  handler: async (ctx, { userId, query, platform }) => {
    const rows = await ctx.db
      .query('receivedTexts')
      .withSearchIndex('search_text', (q) => {
        const mine = q.search('text', query).eq('userId', userId)
        return platform ? mine.eq('platform', platform) : mine
      })
      .take(10)
    return rows.map((r) => ({
      platform: r.platform,
      text: r.text.slice(0, 2000),
      sentAt: r._creationTime,
    }))
  },
})

/** The text of an inbound Spectrum message, or '' for anything else (photos, reactions). */
const textOf = (message: unknown) => {
  const content = (message as { content?: { type?: unknown; text?: unknown } })
    .content
  return content?.type === 'text' && typeof content.text === 'string'
    ? content.text
    : ''
}

/**
 * The Spectrum SDK's batch handler: one turn per burst of texts from a chat
 * on iMessage, WhatsApp or Telegram. A mutation, so the chat's limit is
 * taken here as the burst arrives, like `received` does for Photon's API,
 * and the reply runs after.
 */
const batch = internalMutation({
  args: {
    spaceId: v.string(),
    chainId: v.string(),
    messages: v.array(v.any()),
    carried: v.array(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, { spaceId, chainId, messages, carried }) => {
    const text = [...carried, ...messages]
      .map(textOf)
      .filter(Boolean)
      .join('\n')
    if (!text) {
      await spectrum.completeChain(ctx, { spaceId, chainId })
      return null
    }
    const admitted = await admitText(
      ctx,
      spaceId,
      linkCode(text) ? 'link' : 'message',
    )
    const platform =
      (await spectrum.getSpace(ctx, { spaceId }))?.platform ?? 'imessage'
    await ctx.scheduler.runAfter(0, internal.api.texts.respond, {
      spaceId,
      chainId,
      platform,
      text,
      admitted,
    })
    return null
  },
})

/**
 * Replies to a Spectrum burst, then closes the turn. A newer text replaces
 * the turn (collapse mode), so it checks before calling the model, not only
 * after: a turn replaced while it waited doesn't pay for an answer nobody gets.
 */
const respond = internalAction({
  args: {
    spaceId: v.string(),
    chainId: v.string(),
    platform: v.string(),
    text: v.string(),
    admitted: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { chainId, ...message }) => {
    const chain = { spaceId: message.spaceId, chainId }
    try {
      // ponytail: a text that lands while the model runs still pays for this reply; abort mid-way if that shows up in costs.
      if (await spectrum.isCancelled(ctx, chain)) return null
      const reply = await answer(ctx, message).catch((error: unknown) => {
        console.error(error)
        return (
          budgetMessage(error) ??
          'Sorry, something went wrong. Try again in a minute.'
        )
      })
      // A newer text may have superseded this turn while the lead was thinking.
      if (!reply || (await spectrum.isCancelled(ctx, chain))) return null
      await spectrum.send(ctx, {
        ...chain,
        content: { type: 'text', text: reply },
      })
    } finally {
      await spectrum.completeChain(ctx, chain)
    }
    return null
  },
})

export const textsApi = {
  batch,
  respond,
  links,
  startLink,
  unlink,
  claim,
  forSpace,
  search,
  received,
  replyOnPhoton,
  linkedOwner,
}
