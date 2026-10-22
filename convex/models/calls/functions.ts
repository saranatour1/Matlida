import { saveMessage } from '@convex-dev/agent'
import { ConvexError, v } from 'convex/values'
import { components, internal } from '../../_generated/api'
import { internalMutation, internalQuery } from '../../_generated/server'
import schema from '../../schema'
import { authedMutation, authedQuery } from '../../lib/functions'
import { formatTranscript } from '../../lib/transcript'
import { getOwnedProject } from '../projects/queries'
import { zoned } from '../../lib/time'
import { callLinesTable, liveTurnsTable, phoneStatus } from './table'
import { getOwnedCall, linesOf } from './queries'
import type { Doc } from '../../lib/ctx'

/** Longer lines stay whole in the chat but are cut in the call's transcript. */
const MAX_LINE = 4000

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
    ...callLinesTable.validator.pick('who', 'text', 'ms', 'firstMs').fields,
    /** You talked over the call's last reply before saying this. */
    afterCutOff: v.optional(v.boolean()),
  },
  returns: v.id('calls'),
  handler: async (
    ctx,
    { callId, projectId, botId, threadId, afterCutOff, ...line },
  ) => {
    let id = callId
    if (id) {
      const call = await ctx.db.get('calls', id)
      if (call?.projectId !== projectId)
        throw new ConvexError('Call not found.')
      if (!call.threadId) await ctx.db.patch('calls', id, { threadId })
      if (afterCutOff) {
        const last = await linesOf(ctx, id).order('desc').first()
        if (last?.who === 'them') {
          await ctx.db.patch('callLines', last._id, { cutOff: true })
        }
      }
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
      when: `${zoned(call._creationTime).toFormat('yyyy-MM-dd HH:mm')} UTC`,
      call,
      lines,
    })
  },
})

/** A live turn by its key, for `calls.turn`: starts it, then adds what was heard, a voiced piece, or done. */
const updateLive = internalMutation({
  args: {
    key: v.string(),
    userId: v.id('users'),
    heard: v.optional(v.string()),
    piece: v.optional(liveTurnsTable.validator.fields.pieces.element),
    done: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { key, userId, heard, piece, done }) => {
    const turn = await ctx.db
      .query('liveTurns')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique()
    if (!turn) {
      await ctx.db.insert('liveTurns', {
        key,
        userId,
        heard,
        pieces: piece ? [piece] : [],
        done: done ?? false,
      })
      return null
    }
    if (turn.userId !== userId) throw new ConvexError('Turn not found.')
    await ctx.db.patch('liveTurns', turn._id, {
      ...(heard === undefined ? {} : { heard }),
      ...(piece ? { pieces: [...turn.pieces, piece] } : {}),
      ...(done === undefined ? {} : { done }),
    })
    return null
  },
})

/** Your turn in progress, by the key your browser made for it. */
const live = authedQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const turn = await ctx.db
      .query('liveTurns')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique()
    return turn?.userId === ctx.userId ? turn : null
  },
})

/** Deletes a live turn and its audio once it has had time to play. */
const forgetLive = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, { key }) => {
    const turn = await ctx.db
      .query('liveTurns')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique()
    if (!turn) return null
    for (const piece of turn.pieces) await ctx.storage.delete(piece.storageId)
    await ctx.db.delete('liveTurns', turn._id)
    return null
  },
})

/** Starts a phone call an assistant was asked to place: its record, then the call itself. */
const startPhone = internalMutation({
  args: {
    projectId: v.id('projects'),
    threadId: v.string(),
    from: v.string(),
    to: v.string(),
    say: v.string(),
    about: v.string(),
  },
  returns: v.id('calls'),
  handler: async (ctx, { projectId, threadId, to, ...call }) => {
    // ponytail: the call is filed under the lead, even when a bot placed it.
    const id = await ctx.db.insert('calls', {
      projectId,
      threadId,
      phone: { to, status: 'dialing' },
    })
    await ctx.scheduler.runAfter(0, internal.api.dial.dial, {
      callId: id,
      ...call,
    })
    return id
  },
})

/** A phone call to place, with the project and the name of whoever the assistant calls for. */
const phoneCall = internalQuery({
  args: { id: v.id('calls') },
  returns: v.object({
    call: schema.doc('calls'),
    project: schema.doc('projects'),
    ownerName: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { id }) => {
    const call = await ctx.db.get('calls', id)
    const project = call && (await ctx.db.get('projects', call.projectId))
    if (!call?.phone || !project) throw new ConvexError('Call not found.')
    const owner = await ctx.db.get('users', project.ownerId)
    return { call, project, ownerName: owner?.name ?? null }
  },
})

const ENDINGS = {
  ended: 'it ended',
  busy: 'the line was busy',
  no_answer: 'no answer',
  failed: "the call didn't go through",
}

/**
 * Moves a phone call along. When it ends, the call is closed and the chat
 * gets what was said, or why nobody picked up.
 */
const setPhone = internalMutation({
  args: {
    id: v.id('calls'),
    status: phoneStatus,
    note: v.optional(v.string()),
    heard: v.optional(v.number()),
    from: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, status, note, heard, from }) => {
    const call = await ctx.db.get('calls', id)
    if (!call?.phone) throw new ConvexError('Call not found.')
    const phone = {
      ...call.phone,
      status,
      ...(note === undefined ? {} : { note }),
      ...(heard === undefined ? {} : { heard }),
    }
    if (!(status in ENDINGS)) {
      await ctx.db.patch('calls', id, { phone })
      return null
    }
    await ctx.db.patch('calls', id, { phone, endedAt: Date.now() })
    if (!call.threadId) return null
    const lines = await linesOf(ctx, id).take(40)
    const said = lines
      .map(
        (l) =>
          `> **${l.who === 'you' ? phone.to : (from ?? 'Me')}:** ${l.text}`,
      )
      .join('\n>\n')
    const why = note ? ` (${note})` : ''
    await saveMessage(ctx, components.agent, {
      threadId: call.threadId,
      agentName: from,
      message: {
        role: 'assistant',
        content:
          status !== 'ended'
            ? `📞 I couldn't reach ${phone.to}: ${ENDINGS[status as keyof typeof ENDINGS]}${why}.`
            : said
              ? `📞 My call with ${phone.to}${why}:\n\n${said}`
              : `📞 I called ${phone.to}, but nothing was said${why}.`,
      },
    })
    return null
  },
})

/** Asks the call action to hang up, or to cancel the call while it rings. */
const hangUpPhone = authedMutation({
  args: { id: v.id('calls') },
  handler: async (ctx, { id }) => {
    const call = await getOwnedCall(ctx, ctx.userId, id)
    if (!call.phone || call.endedAt) return
    await ctx.db.patch('calls', id, { phone: { ...call.phone, hangUp: true } })
  },
})

/** A phone call's progress, for its card in the chat. */
const phoneState = authedQuery({
  args: { id: v.id('calls') },
  handler: async (ctx, { id }) => {
    const call = await getOwnedCall(ctx, ctx.userId, id)
    return call.phone
      ? { ...call.phone, startedAt: call._creationTime, endedAt: call.endedAt }
      : null
  },
})

export const callLogApi = {
  startPhone,
  phoneCall,
  setPhone,
  hangUpPhone,
  phoneState,
  addLine,
  end,
  history,
  transcript,
  dump,
  updateLive,
  live,
  forgetLive,
}
