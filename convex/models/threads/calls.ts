import { vResultValidator, vWorkflowId } from '@convex-dev/workflow'
import { zid } from 'convex-helpers/server/zod4'
import { literals } from 'convex-helpers/validators'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { generateSpeech } from 'ai'
import { internal } from '../../_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import { speechModel } from '../../lib/ai'
import { metered } from '../../lib/budget'
import { AUDIO_VOICES, PCM_RATE, pcmToWav } from '../../lib/audio'
import {
  GOODBYE_WORD,
  JEV_THRESHOLDS,
  OPEN_CALL,
  saidGoodbye,
} from '../../lib/decide'
import { zAuthedAction, zAuthedMutation } from '../../lib/functions'
import { workflow } from '../../lib/workflow'
import { LANGUAGES, MODELS, VOICES, voiceFor } from '../../lib/models'
import { takePieces } from '../../lib/sentences'
import {
  addCallLine,
  hangUpScore,
  quickScore,
  updateLiveTurn,
} from '../calls/functions'
import { getOwnedCall } from '../calls/queries'
import { turnStatus } from '../calls/table'
import { getOwnedProject } from '../projects/queries'
import { gatewayCost } from '../usage/functions'
import { postMessage, runReply, transcribeClip, zTimeZone } from './chat'
import { ensureMainThread } from './functions'
import { concat, speakWith } from './voice'
import type { Infer, ObjectType } from 'convex/values'
import type { ActionCtx, Id, MutationCtx } from '../../lib/ctx'
import type { Language } from '../../lib/models'

/** How long a spoken reply stays in storage, long enough to play it. */
const AUDIO_TTL_MS = 10 * 60_000
/** Replies past this many characters stay in the chat but aren't read out. */
const MAX_SPOKEN = 2000
/** Speech that takes longer than this gives up, so a call never waits on it forever. */
export const SPEECH_TIMEOUT_MS = 15_000

/** `postMessage` for a call turn, which runs in an action. */
const post = internalMutation({
  args: {
    userId: v.id('users'),
    projectId: v.id('projects'),
    botId: v.optional(v.id('bots')),
    prompt: v.string(),
  },
  returns: v.object({
    threadId: v.string(),
    promptMessageId: v.string(),
    command: v.optional(v.string()),
  }),
  handler: async (ctx, { userId, ...message }) =>
    await postMessage(ctx, userId, message),
})

/** Deletes a spoken reply once it has had time to play. */
const forget = internalMutation({
  args: { storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    await ctx.storage.delete(storageId)
    return null
  },
})

const synthesize = async (
  ctx: ActionCtx,
  userId: Id<'users'>,
  text: string,
  spokenBy: (typeof VOICES)[number],
) => {
  const { audio } = await metered(
    ctx,
    { userId, model: MODELS.speech, estimate: 0.01 },
    async () => {
      const spoken = await generateSpeech({
        model: speechModel,
        text: text.slice(0, MAX_SPOKEN),
        voice: spokenBy,
        abortSignal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
      })
      return { result: spoken, cost: gatewayCost(spoken.providerMetadata) }
    },
  )
  return audio
}

const store = async (
  ctx: ActionCtx,
  audio: Awaited<ReturnType<typeof synthesize>>,
) => {
  const storageId = await ctx.storage.store(
    new Blob([new Uint8Array(audio.uint8Array)], { type: audio.mediaType }),
  )
  return { storageId, url: (await ctx.storage.getUrl(storageId)) ?? '' }
}

/** Speech for `text`, stored and deleted after 10 minutes. Returns its URL. */
const speak = async (
  ctx: ActionCtx,
  userId: Id<'users'>,
  text: string,
  name: string,
) => {
  const { storageId, url } = await store(
    ctx,
    await synthesize(ctx, userId, text, voiceFor(name)),
  )
  await ctx.scheduler.runAfter(AUDIO_TTL_MS, internal.api.calls.forget, {
    storageId,
  })
  return url
}

/** A turn's statuses while it runs. A new turn cancels one still in them. */
const RUNNING = new Set(['hearing', 'thinking', 'speaking'])

/** What a call turn's workflow and its steps work from. */
const turnArgs = {
  userId: v.id('users'),
  projectId: v.id('projects'),
  botId: v.optional(v.id('bots')),
  threadId: v.string(),
  callId: v.id('calls'),
  storageId: v.id('_storage'),
  /** The live turn the browser watches. */
  liveKey: v.string(),
  /** When the turn started, for how long the reply took. */
  startedAt: v.number(),
  timeZone: v.optional(v.string()),
  interrupted: v.optional(v.boolean()),
  fast: v.optional(v.boolean()),
  voice: v.optional(literals(...VOICES)),
  audioVoice: v.optional(literals(...AUDIO_VOICES)),
  /** An ISO 639-1 code, checked by `startTurn`. */
  language: v.optional(v.string()),
}
type TurnArgs = ObjectType<typeof turnArgs>

/**
 * One turn of a call, from the browser once you stop talking: records it as
 * the call's current turn and starts the workflow that answers it. A turn
 * still running on the call is cancelled first, so only one ever runs and a
 * reply you talked over stops instead of finishing unheard. The browser
 * watches the live turn `liveKey` for the reply's pieces.
 */
const startTurn = zAuthedMutation({
  args: {
    projectId: zid('projects'),
    botId: zid('bots').optional(),
    storageId: zid('_storage'),
    timeZone: zTimeZone.optional(),
    /** The call, from its first turn or `calls.answer`. Unset starts one. */
    callId: zid('calls').optional(),
    /** You talked over the last reply, so it's marked cut off. */
    interrupted: z.boolean().optional(),
    /** The live turn to fill: made by the browser so it can watch from the start. */
    liveKey: z.string().min(8).max(64),
    /** Fast voice: one audio chat model hears and answers, without tools. The recording is a WAV. */
    fast: z.boolean().optional(),
    /** A voice picked in the call's settings, instead of the assistant's own. */
    voice: z.enum(VOICES).optional(),
    /** The same, for Fast voice, which has its own voices. */
    audioVoice: z.enum(AUDIO_VOICES).optional(),
    /** The language to hear and speak, as an ISO 639-1 code. Unset means whatever you speak. */
    language: z
      .enum(Object.keys(LANGUAGES) as [Language, ...Array<Language>])
      .optional(),
  },
  handler: async (ctx, { callId: given, ...turn }) => {
    const project = await getOwnedProject(ctx, ctx.userId, turn.projectId)
    const bot = turn.botId ? await ctx.db.get('bots', turn.botId) : null
    if (turn.botId && bot?.projectId !== project._id) {
      throw new ConvexError('Assistant not found.')
    }
    // The reply goes to the assistant's one thread, whatever the call started on.
    const threadId = await ensureMainThread(ctx, project, bot)
    let callId = given
    if (callId) {
      const call = await getOwnedCall(ctx, ctx.userId, callId)
      if (call.turn && RUNNING.has(call.turn.status)) {
        await workflow.cancel(ctx, call.turn.workflowId)
        await updateLiveTurn(ctx, {
          key: call.turn.key,
          userId: ctx.userId,
          done: true,
        })
      }
    } else {
      callId = await ctx.db.insert('calls', {
        projectId: project._id,
        botId: bot?._id,
        threadId,
      })
    }
    await updateLiveTurn(ctx, { key: turn.liveKey, userId: ctx.userId })
    await ctx.scheduler.runAfter(AUDIO_TTL_MS, internal.api.calls.forgetLive, {
      key: turn.liveKey,
    })
    const workflowId = await workflow.start(
      ctx,
      internal.api.calls.runTurn,
      { ...turn, userId: ctx.userId, threadId, callId, startedAt: Date.now() },
      {
        onComplete: internal.api.calls.turnFinished,
        context: { callId, liveKey: turn.liveKey, userId: ctx.userId },
      },
    )
    await ctx.db.patch('calls', callId, {
      turn: { key: turn.liveKey, workflowId, status: 'hearing' },
    })
    return { callId, threadId }
  },
})

const runTurn = workflow
  .define({ args: turnArgs })
  .handler(async (step, turn): Promise<void> => {
    await step.runAction(
      turn.fast ? internal.api.calls.fastStep : internal.api.calls.turnStep,
      turn,
      { retry: false },
    )
  })

/** Transcribes the turn and saves it. Null when nothing was said. */
const hearTurn = async (
  ctx: ActionCtx,
  turn: TurnArgs,
): Promise<{
  promptMessageId: string
  command?: string
  speaker: string
} | null> => {
  const heard = await transcribeClip(
    ctx,
    turn.userId,
    turn.storageId,
    turn.language as Language | undefined,
  )
  if (!heard.text) {
    await ctx.runMutation(internal.api.calls.updateLive, {
      key: turn.liveKey,
      userId: turn.userId,
      heard: '',
      done: true,
    })
    return null
  }
  return await ctx.runMutation(internal.api.calls.heard, {
    userId: turn.userId,
    projectId: turn.projectId,
    botId: turn.botId,
    threadId: turn.threadId,
    callId: turn.callId,
    liveKey: turn.liveKey,
    interrupted: turn.interrupted,
    text: heard.text,
    aiCost: gatewayCost(heard.providerMetadata),
  })
}

/**
 * Everything a heard turn saves, in one write: the message in the chat, the
 * call's line, what listening cost, the live turn, and the call's status.
 */
const heard = internalMutation({
  args: {
    userId: v.id('users'),
    projectId: v.id('projects'),
    botId: v.optional(v.id('bots')),
    threadId: v.string(),
    callId: v.id('calls'),
    liveKey: v.string(),
    interrupted: v.optional(v.boolean()),
    text: v.string(),
    aiCost: v.number(),
  },
  returns: v.object({
    promptMessageId: v.string(),
    command: v.optional(v.string()),
    speaker: v.string(),
  }),
  handler: async (ctx, turn) => {
    const who = turn.botId
      ? await ctx.db.get('bots', turn.botId)
      : await ctx.db.get('projects', turn.projectId)
    const posted = await postMessage(ctx, turn.userId, {
      projectId: turn.projectId,
      botId: turn.botId,
      prompt: turn.text.slice(0, 4000),
    })
    await addCallLine(ctx, {
      callId: turn.callId,
      projectId: turn.projectId,
      threadId: turn.threadId,
      who: 'you',
      text: turn.text,
      afterCutOff: turn.interrupted,
    })
    await ctx.db.insert('usage', {
      projectId: turn.projectId,
      threadId: turn.threadId,
      kind: 'voice',
      label: 'Listening',
      aiCost: turn.aiCost,
      inputTokens: 0,
      outputTokens: 0,
    })
    await updateLiveTurn(ctx, {
      key: turn.liveKey,
      userId: turn.userId,
      heard: turn.text,
    })
    await setStatus(ctx, turn.callId, turn.liveKey, 'thinking')
    return {
      promptMessageId: posted.promptMessageId,
      command: posted.command,
      speaker: who?.name ?? '',
    }
  },
})

/** Moves the call's turn along, unless a newer turn took its place. */
const setStatus = async (
  ctx: MutationCtx,
  callId: Id<'calls'>,
  key: string,
  status: Infer<typeof turnStatus>,
  note?: string,
) => {
  const call = await ctx.db.get('calls', callId)
  if (call?.turn?.key !== key) return
  await ctx.db.patch('calls', callId, {
    turn: { ...call.turn, status, ...(note ? { note } : {}) },
  })
}

const setTurn = internalMutation({
  args: { callId: v.id('calls'), key: v.string(), status: turnStatus },
  returns: v.null(),
  handler: async (ctx, { callId, key, status }) => {
    await setStatus(ctx, callId, key, status)
    return null
  },
})

/** Whether `key` is still the call's turn, or a newer one took over. */
const isCurrent = internalQuery({
  args: { callId: v.id('calls'), key: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { callId, key }) =>
    (await ctx.db.get('calls', callId))?.turn?.key === key,
})

const GOODBYE = `Talk soon. ${GOODBYE_WORD}.`
const FILLER = 'One moment.'
const FILLER_AFTER_MS = 1500

const turnStep = internalAction({
  args: turnArgs,
  returns: v.null(),
  handler: async (ctx, turn) => {
    const { userId, callId, liveKey: key } = turn
    const said = await hearTurn(ctx, turn)
    if (!said) return null
    const heardMs = Date.now() - turn.startedAt
    const conversation = await ctx.runQuery(internal.api.calls.conversation, {
      callId,
    })
    const judging = hangUpScore(ctx, userId, {
      about: OPEN_CALL,
      conversation,
    })
    const quickness = said.command
      ? 0
      : await quickScore(ctx, userId, conversation)
    const quick = quickness >= JEV_THRESHOLDS.quickReply
    const routed = ctx.runMutation(internal.api.judgments.record, {
      userId,
      kind: 'voice_route',
      model: MODELS.callDecide,
      scores: { quick: quickness },
      outcome: quick ? 'quick' : 'assistant',
    })
    const stop = new AbortController()
    const current = async () => {
      if (stop.signal.aborted) return false
      const still: boolean = await ctx.runQuery(internal.api.calls.isCurrent, {
        callId,
        key,
      })
      if (!still) stop.abort()
      return still
    }
    if (!(await current())) return null
    let buffer = ''
    let spoken = 0
    let textMs: number | undefined
    let firstMs: number | undefined
    let speaking = Promise.resolve()
    const say = (piece: string, name: string, filler = false) => {
      const text = piece.slice(0, MAX_SPOKEN - spoken)
      if (!text || stop.signal.aborted) return
      if (!filler) spoken += text.length
      const audio = synthesize(ctx, userId, text, turn.voice ?? voiceFor(name))
      audio.catch(() => undefined)
      speaking = speaking.then(async () => {
        const spokenAudio = await audio
        if (!(await current())) return
        const ready = await store(ctx, spokenAudio)
        if (filler) {
          await ctx.runMutation(internal.api.calls.updateLive, {
            key,
            userId,
            piece: { text, ...ready },
          })
          return
        }
        if (firstMs === undefined) {
          firstMs = Date.now() - turn.startedAt
          await ctx.runMutation(internal.api.calls.setTurn, {
            callId,
            key,
            status: 'speaking',
          })
        }
        await ctx.runMutation(internal.api.calls.updateLive, {
          key,
          userId,
          piece: { text, ...ready },
        })
      })
    }
    let text = ''
    let hangUp = false
    const holding = quick
      ? undefined
      : setTimeout(() => {
          if (spoken === 0) say(FILLER, said.speaker, true)
        }, FILLER_AFTER_MS)
    try {
      const reply = await runReply(ctx, {
        threadId: turn.threadId,
        promptMessageId: said.promptMessageId,
        command: said.command,
        timeZone: turn.timeZone,
        via: 'voice',
        cutOff: turn.interrupted,
        language: turn.language as Language | undefined,
        quick,
        abortSignal: stop.signal,
        onText: (delta, who) => {
          textMs ??= Date.now() - turn.startedAt
          buffer += delta
          const ready = takePieces(buffer, {
            first: spoken === 0,
            final: false,
          })
          buffer = ready.rest
          for (const piece of ready.pieces)
            say(piece, (who.bot ?? who.project).name)
        },
      })
      text = reply.text
      const name = (reply.bot ?? reply.project).name
      for (const piece of takePieces(buffer, {
        first: spoken === 0,
        final: true,
      }).pieces) {
        say(piece, name)
      }
      const goodbye = saidGoodbye(text.trim())
      const over = (await judging) >= JEV_THRESHOLDS.hangUp
      if (text.trim() && !stop.signal.aborted) {
        hangUp = goodbye || over
        const english = (turn.language ?? 'en') === 'en'
        if (over && !goodbye && english) {
          say(GOODBYE, name)
          text = `${text.trim()} ${GOODBYE}`
        }
        await speaking
        await ctx.runMutation(internal.api.judgments.record, {
          userId,
          kind: 'hang_up',
          model: MODELS.callDecide,
          scores: { over: await judging },
          outcome: goodbye ? 'said_goodbye' : over ? 'hung_up' : 'kept_talking',
        })
      }
      await speaking
    } catch (error) {
      // A newer turn stopped this one: nothing more to say.
      if (!stop.signal.aborted) throw error
    } finally {
      clearTimeout(holding)
      await routed
      await speaking.catch(() => undefined)
      await ctx.runMutation(internal.api.calls.updateLive, {
        key,
        userId,
        done: true,
        ...(hangUp && !stop.signal.aborted ? { hangUp: true } : {}),
      })
      if (text.trim() && !stop.signal.aborted) {
        await ctx.runMutation(internal.api.calls.addLine, {
          callId,
          projectId: turn.projectId,
          threadId: turn.threadId,
          who: 'them',
          text,
          ms: Date.now() - turn.startedAt,
          heardMs,
          textMs,
          firstMs,
        })
      }
    }
    return null
  },
})

/**
 * When a turn's workflow ends, however it ended: its live turn is closed, so
 * the browser never waits on a turn that died, and the call's status says how
 * it went, unless a newer turn took over.
 */
const turnFinished = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({
      callId: v.id('calls'),
      liveKey: v.string(),
      userId: v.id('users'),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { result, context: { callId, liveKey } }) => {
    const live = await ctx.db
      .query('liveTurns')
      .withIndex('by_key', (q) => q.eq('key', liveKey))
      .unique()
    if (live && !live.done) {
      await ctx.db.patch('liveTurns', live._id, {
        done: true,
        ...(result.kind === 'failed'
          ? { error: "Couldn't reach the assistant. Try again." }
          : {}),
      })
    }
    await setStatus(
      ctx,
      callId,
      liveKey,
      result.kind === 'success'
        ? 'done'
        : result.kind === 'failed'
          ? 'failed'
          : 'canceled',
      result.kind === 'failed' ? result.error.slice(0, 300) : undefined,
    )
    return null
  },
})

/** Seconds of reply audio per piece: a short first one so it starts soon, then longer ones. */
const FIRST_PIECE_BYTES = PCM_RATE * 2 * 0.6
const PIECE_BYTES = PCM_RATE * 2 * 2

/**
 * A Fast voice turn: an audio chat model hears the recording and answers in
 * voice, cut into pieces as it streams so it starts playing early. Saved to
 * the chat and the call's transcript like any turn. No tools.
 */
const fastStep = internalAction({
  args: turnArgs,
  returns: v.null(),
  handler: async (ctx, turn) => {
    await fastTurn(ctx, turn)
    return null
  },
})

const fastTurn = async (ctx: ActionCtx, fast: TurnArgs) => {
  const { userId, callId, liveKey: key } = fast
  const live = (update: {
    heard?: string
    piece?: { text: string; url: string; storageId: Id<'_storage'> }
    done?: boolean
    hangUp?: boolean
  }) =>
    ctx.runMutation(internal.api.calls.updateLive, { key, userId, ...update })
  let pending: Array<Uint8Array> = []
  let pendingBytes = 0
  let saidChars = 0
  let heardMs: number | undefined
  let firstMs: number | undefined
  let speaking = Promise.resolve()
  const flush = (transcript: string) => {
    if (!pendingBytes) return
    const pcm = concat(pending)
    const text = transcript.slice(saidChars)
    pending = []
    pendingBytes = 0
    saidChars = transcript.length
    speaking = speaking.then(async () => {
      const storageId = await ctx.storage.store(
        new Blob([pcmToWav(pcm)], { type: 'audio/wav' }),
      )
      await ctx.scheduler.runAfter(AUDIO_TTL_MS, internal.api.calls.forget, {
        storageId,
      })
      if (firstMs === undefined) {
        firstMs = Date.now() - fast.startedAt
        await ctx.runMutation(internal.api.calls.setTurn, {
          callId,
          key,
          status: 'speaking',
        })
      }
      const url = (await ctx.storage.getUrl(storageId)) ?? ''
      await live({ piece: { text, url, storageId } })
    })
  }
  let spoken
  try {
    spoken = await speakWith(ctx, {
      userId,
      projectId: fast.projectId,
      botId: fast.botId,
      storageId: fast.storageId,
      timeZone: fast.timeZone,
      voice: fast.audioVoice,
      language: fast.language as Language | undefined,
      cutOff: fast.interrupted,
      onHeard: (text) => {
        heardMs = Date.now() - fast.startedAt
        return live({ heard: text })
      },
      onAudio: (pcm, transcript) => {
        pending.push(pcm)
        pendingBytes += pcm.length
        if (pendingBytes >= (saidChars ? PIECE_BYTES : FIRST_PIECE_BYTES)) {
          flush(transcript)
        }
      },
    })
    // A silent clip's cut-off reply isn't played.
    if (spoken.heard) flush(spoken.reply)
    await speaking
  } finally {
    await speaking.catch(() => undefined)
    await live({
      done: true,
      ...(spoken?.heard && saidGoodbye(spoken.reply.trim())
        ? { hangUp: true }
        : {}),
    })
  }
  if (!spoken.heard) return
  await ctx.runMutation(internal.api.voice.save, {
    threadId: spoken.threadId,
    heard: spoken.heard,
    reply: spoken.reply,
    agentName: (spoken.bot ?? spoken.project).name,
  })
  await ctx.runMutation(internal.api.calls.addLine, {
    callId,
    projectId: fast.projectId,
    botId: fast.botId,
    threadId: spoken.threadId,
    who: 'you',
    text: spoken.heard,
    afterCutOff: fast.interrupted,
  })
  if (spoken.reply) {
    await ctx.runMutation(internal.api.calls.addLine, {
      callId,
      projectId: fast.projectId,
      threadId: spoken.threadId,
      who: 'them',
      text: spoken.reply,
      ms: Date.now() - fast.startedAt,
      heardMs,
      firstMs,
    })
  }
}

type Answered = {
  projectId: Id<'projects'>
  threadId: string
  botId?: Id<'bots'>
  from: string
  message: string
  checkIn: boolean
  text: string
  /** The call's record, started with the opening line. */
  callId: Id<'calls'>
  audioUrl: string | null
}

/**
 * Picks up a ringing call reminder: the assistant opens the call by saying
 * the reminder. Null when it already stopped ringing.
 */
const answer = zAuthedAction({
  args: { id: zid('reminders') },
  handler: async (ctx, { id }): Promise<Answered | null> => {
    const call: Omit<Answered, 'text' | 'audioUrl' | 'callId'> | null =
      await ctx.runMutation(internal.api.reminders.pickUp, {
        id,
        userId: ctx.userId,
      })
    if (!call) return null
    const text = call.checkIn
      ? `Hi, it's ${call.from}. ${call.message}`
      : `Hi, it's ${call.from} with your reminder. ${call.message}`
    const callId: Id<'calls'> = await ctx.runMutation(
      internal.api.calls.addLine,
      {
        projectId: call.projectId,
        botId: call.botId,
        threadId: call.threadId,
        who: 'them',
        text,
      },
    )
    // Without audio the call still opens: the line shows, and you can talk.
    const audioUrl = await speak(ctx, ctx.userId, text, call.from).catch(
      (error: unknown) => {
        console.error('opening line not spoken', error)
        return null
      },
    )
    return { ...call, text, callId, audioUrl }
  },
})

export const callsApi = {
  post,
  forget,
  answer,
  startTurn,
  runTurn,
  turnStep,
  heard,
  setTurn,
  isCurrent,
  fastStep,
  turnFinished,
}
