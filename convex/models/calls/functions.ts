import { ConvexError, v } from 'convex/values'
import { internalMutation, internalQuery } from '../../_generated/server'
import { authedMutation, authedQuery } from '../../lib/functions'
import { formatTranscript } from '../../lib/transcript'
import { getOwnedProject } from '../projects/functions'
import { callLinesTable } from './table'
import type { Doc, Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'

/** Longer lines stay whole in the chat but are cut in the call's transcript. */
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

function linesOf(ctx: Pick<QueryCtx, 'db'>, callId: Id<'calls'>) {
  return ctx.db
    .query('callLines')
    .withIndex('by_call', (q) => q.eq('callId', callId))
}

/**
 * Saves one line of a call as soon as it's said, starting the call's record
 * with its first line. For `calls.turn` and `calls.answer`, which have checked
 * the project is the caller's. Returns the call's id.
 */
const addLine = internalMutation({
  args: {
    callId: v.optional(v.id('calls')),
    projectId: v.id('projects'),
    botId: v.optional(v.id('bots')),
    threadId: v.string(),
    ...callLinesTable.validator.pick('who', 'text', 'ms').fields,
  },
  returns: v.id('calls'),
  handler: async (ctx, { callId, projectId, botId, threadId, ...line }) => {
    let id = callId
    if (id) {
      const call = await ctx.db.get('calls', id)
      if (call?.projectId !== projectId)
        throw new ConvexError('Call not found.')
      if (!call.threadId) await ctx.db.patch('calls', id, { threadId })
    } else {
      id = await ctx.db.insert('calls', { projectId, botId, threadId })
    }
    await ctx.db.insert('callLines', {
      ...line,
      callId: id,
      text: line.text.slice(0, MAX_LINE),
    })
    return id
  },
})

const end = authedMutation({
  args: { id: v.id('calls') },
  handler: async (ctx, { id }) => {
    const call = await getOwnedCall(ctx, ctx.userId, id)
    if (!call.endedAt) await ctx.db.patch('calls', id, { endedAt: Date.now() })
  },
})

/**
 * An assistant's recent calls, newest first, each with its first line. A call
 * that never hung up cleanly (a closed tab) ends at its last line.
 */
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
        const first = await linesOf(ctx, call._id).first()
        const last = await linesOf(ctx, call._id).order('desc').first()
        return {
          ...call,
          firstLine: first?.text ?? null,
          endedAt: call.endedAt ?? last?._creationTime ?? call._creationTime,
        }
      }),
    )
  },
})

const transcript = authedQuery({
  args: { id: v.id('calls') },
  handler: async (ctx, { id }) => {
    await getOwnedCall(ctx, ctx.userId, id)
    return await linesOf(ctx, id).take(500)
  },
})

/**
 * A call's transcript as plain text, with timings: the most recent call, or
 * `id`. For the CLI: `npx convex run api/calls:dump`.
 */
const dump = internalQuery({
  args: { id: v.optional(v.id('calls')) },
  returns: v.string(),
  handler: async (ctx, { id }) => {
    const call: Doc<'calls'> | null = id
      ? await ctx.db.get('calls', id)
      : await ctx.db.query('calls').order('desc').first()
    if (!call) return 'No calls yet.'
    const [project, bot, lines] = await Promise.all([
      ctx.db.get('projects', call.projectId),
      call.botId ? ctx.db.get('bots', call.botId) : null,
      linesOf(ctx, call._id).take(500),
    ])
    return formatTranscript({
      name: (bot ?? project)?.name ?? 'Assistant',
      when: `${new Date(call._creationTime).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      call,
      lines,
    })
  },
})

export const callLogApi = { addLine, end, history, transcript, dump }
