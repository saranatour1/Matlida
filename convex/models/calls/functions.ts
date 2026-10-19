import { ConvexError, v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { authedMutation, authedQuery } from '../../lib/functions'
import { getOwnedProject } from '../projects/functions'
import { callLinesTable } from './table'
import type { Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'

/** Lines past this stay in the chat but not in the call's transcript. */
const MAX_LINE = 4000

async function getOwnedCall(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
  id: Id<'calls'>,
) {
  const call = await ctx.db.get('calls', id)
  if (!call) throw new ConvexError('Call not found.')
  await getOwnedProject(ctx, userId, call.projectId)
  return call
}

/** Starts a call's record once the microphone is on. `opening` is what the assistant said first, when it called you. */
const begin = authedMutation({
  args: {
    projectId: v.id('projects'),
    botId: v.optional(v.id('bots')),
    threadId: v.optional(v.string()),
    opening: v.optional(v.string()),
  },
  handler: async (ctx, { opening, ...call }) => {
    await getOwnedProject(ctx, ctx.userId, call.projectId)
    if (call.botId) {
      const bot = await ctx.db.get('bots', call.botId)
      if (bot?.projectId !== call.projectId) {
        throw new ConvexError('Assistant not found.')
      }
    }
    const callId = await ctx.db.insert('calls', call)
    if (opening) {
      await ctx.db.insert('callLines', {
        callId,
        who: 'them',
        text: opening.slice(0, MAX_LINE),
      })
    }
    return callId
  },
})

const end = authedMutation({
  args: { id: v.id('calls') },
  handler: async (ctx, { id }) => {
    const call = await getOwnedCall(ctx, ctx.userId, id)
    if (!call.endedAt) await ctx.db.patch('calls', id, { endedAt: Date.now() })
  },
})

/** Saves a turn's lines for `calls.turn`, which has checked the project is the caller's. */
const addLines = internalMutation({
  args: {
    callId: v.id('calls'),
    projectId: v.id('projects'),
    threadId: v.string(),
    lines: v.array(callLinesTable.validator.pick('who', 'text')),
  },
  returns: v.null(),
  handler: async (ctx, { callId, projectId, threadId, lines }) => {
    const call = await ctx.db.get('calls', callId)
    if (call?.projectId !== projectId) throw new ConvexError('Call not found.')
    if (!call.threadId) await ctx.db.patch('calls', callId, { threadId })
    for (const { who, text } of lines) {
      await ctx.db.insert('callLines', {
        callId,
        who,
        text: text.slice(0, MAX_LINE),
      })
    }
    return null
  },
})

/** An assistant's recent calls, newest first, each with its first line. */
const history = authedQuery({
  args: { projectId: v.id('projects'), botId: v.optional(v.id('bots')) },
  handler: async (ctx, { projectId, botId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_project_and_bot', (q) =>
        q.eq('projectId', projectId).eq('botId', botId),
      )
      .order('desc')
      .take(20)
    return await Promise.all(
      calls.map(async (call) => {
        const first = await ctx.db
          .query('callLines')
          .withIndex('by_call', (q) => q.eq('callId', call._id))
          .first()
        return { ...call, firstLine: first?.text ?? null }
      }),
    )
  },
})

const transcript = authedQuery({
  args: { id: v.id('calls') },
  handler: async (ctx, { id }) => {
    await getOwnedCall(ctx, ctx.userId, id)
    return await ctx.db
      .query('callLines')
      .withIndex('by_call', (q) => q.eq('callId', id))
      .take(500)
  },
})

export const callLogApi = { begin, end, addLines, history, transcript }
