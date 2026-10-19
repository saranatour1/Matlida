import { ConvexError, v } from 'convex/values'
import { internal } from '../../_generated/api'
import { internalAction, internalMutation } from '../../_generated/server'
import { authedMutation, authedQuery } from '../../lib/functions'
import schema from '../../schema'
import { getBots } from '../bots/functions'
import { getOwnedProject } from '../projects/functions'
import { startThread } from '../threads/functions'
import { createLead } from '../threads/lead'
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

async function getLink(ctx: Pick<QueryCtx, 'db'>, projectId: Id<'projects'>) {
  return await ctx.db
    .query('phoneLinks')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .unique()
}

/** The project's phone link, without the code once it's linked. */
const link = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await getLink(ctx, projectId)
  },
})

/** Replaces the project's link with a fresh one-time code to text from the phone. */
const startLink = authedMutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    const existing = await getLink(ctx, projectId)
    if (existing) await ctx.db.delete('phoneLinks', existing._id)
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
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    const existing = await getLink(ctx, projectId)
    if (!existing) throw new ConvexError('This project has no phone linked.')
    await ctx.db.delete('phoneLinks', existing._id)
  },
})

/** Links the phone that texted a valid code. A phone talks to one project at a time. */
const claim = internalMutation({
  args: { code: v.string(), spaceId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { code, spaceId }) => {
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
    await ctx.db.replace('phoneLinks', pending._id, {
      status: 'linked',
      ownerId: pending.ownerId,
      projectId: pending.projectId,
      spaceId,
    })
    const project = await ctx.db.get('projects', pending.projectId)
    return project?.name ?? null
  },
})

/** The linked project for a phone, with its "Texts" chat started if needed. */
const forSpace = internalMutation({
  args: { spaceId: v.string() },
  returns: v.union(
    v.object({
      project: schema.doc('projects'),
      bots: v.array(schema.doc('bots')),
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
    const threadId = linked.threadId ?? (await startTextsThread(ctx, linked))
    return { project, bots: await getBots(ctx, project._id), threadId }
  },
})

async function startTextsThread(
  ctx: MutationCtx,
  phoneLink: Extract<Doc<'phoneLinks'>, { status: 'linked' }>,
) {
  const threadId = await startThread(ctx, {
    projectId: phoneLink.projectId,
    kind: 'chat',
    title: 'Texts',
    userId: phoneLink.ownerId,
  })
  await ctx.db.patch('phoneLinks', phoneLink._id, { threadId })
  return threadId
}

/** What to text back to a message from `spaceId`. Links the phone or runs the lead. */
const answer = internalAction({
  args: { spaceId: v.string(), text: v.string() },
  returns: v.string(),
  handler: async (ctx, { spaceId, text }): Promise<string> => {
    const code = /^link\s+([a-z0-9]{6})$/i.exec(text.trim())?.[1]
    if (code) {
      const name: string | null = await ctx.runMutation(
        internal.api.texts.claim,
        { code, spaceId },
      )
      return name
        ? `Linked to ${name}. Text me anytime.`
        : "That code didn't match. Get a new one on the Texting page in Matilda."
    }
    const linked: {
      project: Doc<'projects'>
      bots: Array<Doc<'bots'>>
      threadId: string
    } | null = await ctx.runMutation(internal.api.texts.forSpace, { spaceId })
    if (!linked) {
      return "This number isn't linked yet. Open Texting in Matilda and text me the code it shows."
    }
    const { project, bots, threadId } = linked
    const lead = createLead(project, bots, { viaText: true })
    const reply = await lead.agent.generateText(
      ctx,
      { threadId, userId: project.ownerId },
      { prompt: text, tools: lead.tools },
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
          .runAction(internal.api.texts.answer, { spaceId: args.spaceId, text })
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
  link,
  startLink,
  unlink,
  claim,
  forSpace,
  answer,
  respond,
}
