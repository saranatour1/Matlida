import { saveMessage } from '@convex-dev/agent'
import { ConvexError, v } from 'convex/values'
import { components, internal } from '../../_generated/api'
import { internalMutation, internalQuery } from '../../_generated/server'
import schema from '../../schema'
import { callDecisionModel } from '../../lib/ai'
import { metered } from '../../lib/budget'
import { callIsOver, needsNoTools } from '../../lib/decide'
import { authedMutation, authedQuery } from '../../lib/functions'
import { MODELS } from '../../lib/models'
import { maskNumber } from '../../lib/phone'
import { formatTranscript } from '../../lib/transcript'
import { getOwnedProject } from '../projects/queries'
import { zoned } from '../../lib/time'
import { callLinesTable, liveTurnsTable, phoneStatus } from './table'
import { getOwnedCall, linesOf } from './queries'
import type { ObjectType } from 'convex/values'
import type { Turn } from '../../lib/decide'
import type { Experimental_DecisionModel } from 'ai'
import type { ActionCtx, Doc, Id, MutationCtx } from '../../lib/ctx'

/** Longer lines stay whole in the chat but are cut in the call's transcript. */
const MAX_LINE = 4000

const lineArgs = {
  callId: v.optional(v.id('calls')),
  projectId: v.id('projects'),
  botId: v.optional(v.id('bots')),
  threadId: v.string(),
  ...callLinesTable.validator.pick(
    'who',
    'text',
    'ms',
    'firstMs',
    'heardMs',
    'textMs',
  ).fields,
  /** You talked over the call's last reply before saying this. */
  afterCutOff: v.optional(v.boolean()),
}

/** `addLine`, inside another mutation. */
export const addCallLine = async (
  ctx: MutationCtx,
  {
    callId,
    projectId,
    botId,
    threadId,
    afterCutOff,
    ...line
  }: ObjectType<typeof lineArgs>,
) => {
  let id = callId
  if (id) {
    const call = await ctx.db.get('calls', id)
    if (call?.projectId !== projectId) throw new ConvexError('Call not found.')
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
}

/**
 * Saves one line of a call as soon as it's said, starting the call's record
 * with its first line. For call turns and `calls.answer`, which have checked
 * the project is the caller's. Returns the call's id.
 */
const addLine = internalMutation({
  args: lineArgs,
  returns: v.id('calls'),
  handler: async (ctx, line) => await addCallLine(ctx, line),
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
          recordingUrl: call.phone?.recording
            ? await ctx.storage.getUrl(call.phone.recording)
            : null,
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

const callDecision = async (
  ctx: ActionCtx,
  userId: Id<'users'>,
  ask: (
    model: Experimental_DecisionModel,
  ) => Promise<{ score: number; cost: number }>,
) => {
  try {
    return await metered(
      ctx,
      { userId, model: MODELS.callDecide, estimate: 0.005 },
      async () => {
        const { score, cost } = await ask(callDecisionModel)
        return { result: score, cost }
      },
    )
  } catch (error) {
    console.error(error)
    return 0
  }
}

/** Whether a call ends once the assistant has answered the last thing said. 0 on failure, so the call goes on. */
export const hangUpScore = (
  ctx: ActionCtx,
  userId: Id<'users'>,
  call: { about: string; conversation: Array<Turn> },
) =>
  callDecision(ctx, userId, async (model) => {
    const judged = await callIsOver(model, call)
    return { score: judged.over, cost: judged.cost }
  })

/** Whether a quick answer with no tools will do for the last thing said. 0 on failure, so the assistant answers. */
export const quickScore = (
  ctx: ActionCtx,
  userId: Id<'users'>,
  conversation: Array<Turn>,
) =>
  callDecision(ctx, userId, async (model) => {
    const judged = await needsNoTools(model, { conversation })
    return { score: judged.quick, cost: judged.cost }
  })

const conversation = internalQuery({
  args: { callId: v.id('calls') },
  returns: v.array(
    v.object({
      role: v.union(v.literal('user'), v.literal('assistant')),
      text: v.string(),
    }),
  ),
  handler: async (ctx, { callId }) => {
    const lines = await linesOf(ctx, callId).order('desc').take(30)
    return lines.reverse().map((line) => ({
      role: line.who === 'you' ? ('user' as const) : ('assistant' as const),
      text: line.text,
    }))
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

const liveArgs = {
  key: v.string(),
  userId: v.id('users'),
  heard: v.optional(v.string()),
  piece: v.optional(liveTurnsTable.validator.fields.pieces.element),
  done: v.optional(v.boolean()),
  error: v.optional(v.string()),
  hangUp: v.optional(v.boolean()),
}

/** `updateLive`, inside another mutation. */
export const updateLiveTurn = async (
  ctx: MutationCtx,
  {
    key,
    userId,
    heard,
    piece,
    done,
    error,
    hangUp,
  }: ObjectType<typeof liveArgs>,
) => {
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
      error,
      hangUp,
    })
    return
  }
  if (turn.userId !== userId) throw new ConvexError('Turn not found.')
  await ctx.db.patch('liveTurns', turn._id, {
    ...(heard === undefined ? {} : { heard }),
    ...(piece ? { pieces: [...turn.pieces, piece] } : {}),
    ...(done === undefined ? {} : { done }),
    ...(error === undefined ? {} : { error }),
    ...(hangUp === undefined ? {} : { hangUp }),
  })
}

/** A live turn by its key: starts it, then adds what was heard, a voiced piece, done, or why it failed. */
const updateLive = internalMutation({
  args: liveArgs,
  returns: v.null(),
  handler: async (ctx, update) => {
    await updateLiveTurn(ctx, update)
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
    const project = await ctx.db.get('projects', projectId)
    if (!project) throw new ConvexError('Project not found.')
    // Filed under the assistant that placed it, so it's in that one's Call history.
    const bot =
      call.from === project.name
        ? null
        : await ctx.db
            .query('bots')
            .withIndex('by_project_and_name', (q) =>
              q.eq('projectId', projectId).eq('name', call.from),
            )
            .first()
    const id = await ctx.db.insert('calls', {
      projectId,
      botId: bot?._id,
      threadId,
      phone: {
        to,
        status: 'dialing',
        askedBy: project.ownerId,
        about: call.about,
      },
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
    recording: v.optional(v.id('_storage')),
    from: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, status, note, heard, recording, from }) => {
    const call = await ctx.db.get('calls', id)
    if (!call?.phone) throw new ConvexError('Call not found.')
    const phone = {
      ...call.phone,
      status,
      ...(note === undefined ? {} : { note }),
      ...(heard === undefined ? {} : { heard }),
      ...(recording === undefined ? {} : { recording }),
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
        (l) => `> **${l.who === 'you' ? 'Them' : (from ?? 'Me')}:** ${l.text}`,
      )
      .join('\n>\n')
    // The chat goes to the model with every reply, so it only names the number's end.
    const number = maskNumber(phone.to)
    const why = note ? ` (${note})` : ''
    await saveMessage(ctx, components.agent, {
      threadId: call.threadId,
      agentName: from,
      message: {
        role: 'assistant',
        content:
          status !== 'ended'
            ? `📞 I couldn't reach ${number}: ${ENDINGS[status as keyof typeof ENDINGS]}${why}.`
            : said
              ? `📞 My call with ${number}${why}:\n\n${said}${phone.recording ? '\n\n_The recording is in Call history._' : ''}`
              : `📞 I called ${number}, but nothing was said${why}.`,
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
  conversation,
  dump,
  updateLive,
  live,
  forgetLive,
}
