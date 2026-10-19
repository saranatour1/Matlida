import { ConvexError, v } from 'convex/values'
import { internal } from '../../_generated/api'
import { internalAction, internalMutation } from '../../_generated/server'
import { authedMutation, authedQuery } from '../../lib/functions'
import { messagingAppName } from '../../lib/channels'
import schema from '../../schema'
import { getBots } from '../bots/functions'
import { getOwnedProject } from '../projects/functions'
import { startThread } from '../threads/functions'
import { createBot, createLead } from '../threads/lead'
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
  args: { code: v.string(), spaceId: v.string(), platform: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { code, spaceId, platform }) => {
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
    })
    const project = await ctx.db.get('projects', pending.projectId)
    return project?.name ?? null
  },
})

type Linked = Extract<Doc<'phoneLinks'>, { status: 'linked' }>

/**
 * Who a message from `spaceId` goes to. A message starting with `@name`
 * switches to that assistant for this and later messages. Starts the
 * assistant's chat for this link if needed. Null when the chat isn't linked.
 */
const forSpace = internalMutation({
  args: { spaceId: v.string(), text: v.string() },
  returns: v.union(
    v.object({
      project: schema.doc('projects'),
      bots: v.array(schema.doc('bots')),
      bot: v.union(schema.doc('bots'), v.null()),
      /** Null when `@name` matched no one here. */
      threadId: v.union(v.string(), v.null()),
      /** The message without its `@name`. */
      prompt: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { spaceId, text }) => {
    const linked = await ctx.db
      .query('phoneLinks')
      .withIndex('by_spaceId', (q) => q.eq('spaceId', spaceId))
      .unique()
    if (linked?.status !== 'linked') return null
    const project = await ctx.db.get('projects', linked.projectId)
    if (!project) return null
    const bots = await getBots(ctx, project._id)
    let botId = linked.activeBotId
    let prompt = text.trim()
    if (prompt.startsWith('@')) {
      const named = addressee(prompt, project, bots)
      if (!named) return { project, bots, bot: null, threadId: null, prompt }
      botId = named.bot?._id
      prompt = named.rest
      if (botId !== linked.activeBotId) {
        await ctx.db.patch('phoneLinks', linked._id, { activeBotId: botId })
      }
    }
    const bot = bots.find((b) => b._id === botId) ?? null
    const threadId = await chatFor(ctx, linked, project, bot)
    return { project, bots, bot, threadId, prompt }
  },
})

/** The assistant a message starting with `@name` is for, longest name first, and the rest of it. */
function addressee(
  text: string,
  project: Doc<'projects'>,
  bots: Array<Doc<'bots'>>,
) {
  const people = [
    { name: project.name, bot: null },
    ...bots.map((bot) => ({ name: bot.name, bot })),
  ]
  people.sort((a, b) => b.name.length - a.name.length)
  const lower = text.toLowerCase()
  for (const person of people) {
    const tag = `@${person.name.toLowerCase()}`
    if (
      lower.startsWith(tag) &&
      !/[\p{L}\p{N}]/u.test(text.charAt(tag.length))
    ) {
      return {
        bot: person.bot,
        rest: text.slice(tag.length).replace(/^[\s,:]+/, ''),
      }
    }
  }
  return null
}

/** This link's chat with `bot` (the lead when null), started on first use. */
async function chatFor(
  ctx: MutationCtx,
  linked: Linked,
  project: Doc<'projects'>,
  bot: Doc<'bots'> | null,
) {
  const existing = bot
    ? linked.botThreads?.find((t) => t.botId === bot._id)?.threadId
    : linked.threadId
  if (existing) return existing
  const threadId = await startThread(ctx, {
    projectId: project._id,
    kind: 'chat',
    title: `${(bot ?? project).name} · ${messagingAppName(linked.platform ?? 'imessage')}`,
    botId: bot?._id,
    userId: linked.ownerId,
  })
  await ctx.db.patch(
    'phoneLinks',
    linked._id,
    bot
      ? {
          botThreads: [
            ...(linked.botThreads ?? []),
            { botId: bot._id, threadId },
          ],
        }
      : { threadId },
  )
  return threadId
}

/** What to send back to a message from `spaceId`. Links the chat, or lets its assistant answer. */
const answer = internalAction({
  args: { spaceId: v.string(), platform: v.string(), text: v.string() },
  returns: v.string(),
  handler: async (ctx, { spaceId, platform, text }): Promise<string> => {
    const code = /^link\s+([a-z0-9]{6})$/i.exec(text.trim())?.[1]
    if (code) {
      const name: string | null = await ctx.runMutation(
        internal.api.texts.claim,
        { code, spaceId, platform },
      )
      return name
        ? `Linked to ${name}. Message me anytime, start with @name to talk to another assistant, or send "who" to see who's here.`
        : "That code didn't match. Get a new one on the Messaging page in Matilda."
    }
    const linked: {
      project: Doc<'projects'>
      bots: Array<Doc<'bots'>>
      bot: Doc<'bots'> | null
      threadId: string | null
      prompt: string
    } | null = await ctx.runMutation(internal.api.texts.forSpace, {
      spaceId,
      text,
    })
    if (!linked) {
      return "This chat isn't linked yet. Open Messaging in Matilda and send me the code it shows."
    }
    const { project, bots, bot, threadId, prompt } = linked
    const names = [project.name, ...bots.map((b) => b.name)].join(', ')
    const current = (bot ?? project).name
    if (!threadId)
      return `There's no one by that name here. You can message ${names}.`
    if (/^who\??$/i.test(prompt)) {
      return `You're talking to ${current}. You can message ${names}: start a message with @name to switch.`
    }
    if (!prompt) return `You're talking to ${current} now.`
    const { agent, tools } = bot
      ? createBot(project, bot, [], { via: 'text' })
      : createLead(project, bots, { via: 'text' })
    const reply = await agent.generateText(
      ctx,
      { threadId, userId: project.ownerId },
      { prompt, tools },
    )
    // Every assistant shares this chat, so bots sign their replies.
    return bot ? `${bot.name}: ${reply.text}` : reply.text
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
        if (await spectrum.isCancelled(ctx, args)) return null
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
  answer,
  respond,
}
