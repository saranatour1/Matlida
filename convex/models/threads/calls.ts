import { zid } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import { z } from 'zod'
import { generateSpeech } from 'ai'
import { internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import { speechModel } from '../../lib/ai'
import { PCM_RATE, pcmToWav } from '../../lib/audio'
import { zAuthedAction } from '../../lib/functions'
import { voiceFor } from '../../lib/models'
import { takePieces } from '../../lib/sentences'
import { gatewayCost } from '../usage/functions'
import { postMessage, runReply, transcribeClip, zTimeZone } from './chat'
import { concat, speakWith } from './voice'
import type { Id } from '../../_generated/dataModel'
import type { ActionCtx } from '../../_generated/server'

/** How long a spoken reply stays in storage, long enough to play it. */
const AUDIO_TTL_MS = 10 * 60_000
/** Replies past this many characters stay in the chat but aren't read out. */
const MAX_SPOKEN = 2000

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

/** Reads `text` out in `name`'s voice and stores it. */
async function voice(ctx: ActionCtx, text: string, name: string) {
  const { audio } = await generateSpeech({
    model: speechModel,
    text: text.slice(0, MAX_SPOKEN),
    voice: voiceFor(name),
  })
  const storageId = await ctx.storage.store(
    new Blob([new Uint8Array(audio.uint8Array)], { type: audio.mediaType }),
  )
  return { storageId, url: (await ctx.storage.getUrl(storageId)) ?? '' }
}

/** `voice`, deleted after 10 minutes. Returns its URL. */
async function speak(ctx: ActionCtx, text: string, name: string) {
  const { storageId, url } = await voice(ctx, text, name)
  await ctx.scheduler.runAfter(AUDIO_TTL_MS, internal.api.calls.forget, {
    storageId,
  })
  return url
}

type Turn = {
  threadId: string | null
  /** The call's record, started by its first turn. */
  callId: Id<'calls'> | null
  transcript: string
  reply: string | null
}

/**
 * One turn of a voice call: transcribes what the user said, saves it to the
 * chat, and lets the chat's assistant answer as it would in the chat but
 * written to be spoken. The answer is spoken a piece at a time as it streams,
 * into the live turn `liveKey` the browser is watching, so it starts playing
 * after the first sentence. Silence gets no reply.
 */
const turn = zAuthedAction({
  args: {
    projectId: zid('projects'),
    botId: zid('bots').optional(),
    threadId: z.string().optional(),
    storageId: zid('_storage'),
    timeZone: zTimeZone.optional(),
    /** The call's record, from its first turn or `calls.answer`, so the turn joins its transcript. */
    callId: zid('calls').optional(),
    /** You talked over the last reply, so it's marked cut off. */
    interrupted: z.boolean().optional(),
    /** The live turn to fill: made by the browser so it can watch from the start. */
    liveKey: z.string().min(8).max(64),
    /** Fast voice: one audio chat model hears and answers, without tools. The recording is a WAV. */
    fast: z.boolean().optional(),
  },
  handler: async (
    ctx,
    { storageId, timeZone, interrupted, liveKey, fast, ...where },
  ): Promise<Turn> => {
    const started = Date.now()
    const live = (update: {
      heard?: string
      piece?: { text: string; url: string; storageId: Id<'_storage'> }
      done?: boolean
    }) =>
      ctx.runMutation(internal.api.calls.updateLive, {
        key: liveKey,
        userId: ctx.userId,
        ...update,
      })
    await live({})
    await ctx.scheduler.runAfter(AUDIO_TTL_MS, internal.api.calls.forgetLive, {
      key: liveKey,
    })
    if (fast) {
      return await fastTurn(ctx, {
        ...where,
        storageId,
        timeZone,
        interrupted,
        started,
        live,
      })
    }
    const heard = await transcribeClip(ctx, storageId)
    if (!heard.text) {
      await live({ heard: '', done: true })
      return {
        threadId: where.threadId ?? null,
        callId: where.callId ?? null,
        transcript: '',
        reply: null,
      }
    }
    await live({ heard: heard.text })
    // The reply goes to the assistant's one thread, whatever the call started on.
    const { callId: _, threadId: __, ...message } = where
    const posted = await ctx.runMutation(internal.api.calls.post, {
      userId: ctx.userId,
      ...message,
      prompt: heard.text.slice(0, 4000),
    })
    // Saved before the reply, so a failed reply can't lose what you said.
    let callId: Id<'calls'> = await ctx.runMutation(
      internal.api.calls.addLine,
      {
        callId: where.callId,
        projectId: where.projectId,
        botId: where.botId,
        threadId: posted.threadId,
        who: 'you',
        text: heard.text,
        afterCutOff: interrupted,
      },
    )
    await ctx.runMutation(internal.api.usage.record, {
      projectId: where.projectId,
      threadId: posted.threadId,
      kind: 'voice',
      label: 'Listening',
      aiCost: gatewayCost(heard.providerMetadata),
      inputTokens: 0,
      outputTokens: 0,
    })
    // Each finished piece is voiced in order while the rest still streams.
    let buffer = ''
    let spoken = 0
    let firstMs: number | undefined
    let speaking = Promise.resolve()
    const say = (piece: string, name: string) => {
      const text = piece.slice(0, MAX_SPOKEN - spoken)
      if (!text) return
      spoken += text.length
      speaking = speaking.then(async () => {
        const audio = await voice(ctx, text, name)
        firstMs ??= Date.now() - started
        await live({ piece: { text, ...audio } })
      })
    }
    let text = ''
    try {
      const reply = await runReply(ctx, {
        ...posted,
        timeZone,
        via: 'voice',
        cutOff: interrupted,
        onText: (delta, who) => {
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
      await speaking
    } finally {
      // If the reply itself failed, a piece still being voiced can't matter.
      await speaking.catch(() => undefined)
      await live({ done: true })
      if (text.trim()) {
        // Saved even when speaking fails, with how long the reply took.
        callId = await ctx.runMutation(internal.api.calls.addLine, {
          callId,
          projectId: where.projectId,
          threadId: posted.threadId,
          who: 'them',
          text,
          ms: Date.now() - started,
          firstMs,
        })
      }
    }
    return {
      threadId: posted.threadId,
      callId,
      transcript: heard.text,
      reply: text.trim() ? text : null,
    }
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
async function fastTurn(
  ctx: ActionCtx & { userId: Id<'users'> },
  fast: {
    projectId: Id<'projects'>
    botId?: Id<'bots'>
    callId?: Id<'calls'>
    storageId: Id<'_storage'>
    timeZone?: string
    interrupted?: boolean
    started: number
    live: (update: {
      heard?: string
      piece?: { text: string; url: string; storageId: Id<'_storage'> }
      done?: boolean
    }) => Promise<unknown>
  },
): Promise<Turn> {
  let pending: Array<Uint8Array> = []
  let pendingBytes = 0
  let saidChars = 0
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
      firstMs ??= Date.now() - fast.started
      const url = (await ctx.storage.getUrl(storageId)) ?? ''
      await fast.live({ piece: { text, url, storageId } })
    })
  }
  let spoken
  try {
    spoken = await speakWith(ctx, {
      ...fast,
      userId: ctx.userId,
      cutOff: fast.interrupted,
      onHeard: (text) => fast.live({ heard: text }),
      onAudio: (pcm, transcript) => {
        pending.push(pcm)
        pendingBytes += pcm.length
        if (pendingBytes >= (saidChars ? PIECE_BYTES : FIRST_PIECE_BYTES)) {
          flush(transcript)
        }
      },
    })
    flush(spoken.reply)
    await speaking
  } finally {
    await speaking.catch(() => undefined)
    await fast.live({ done: true })
  }
  if (!spoken.heard) {
    return {
      threadId: spoken.threadId,
      callId: fast.callId ?? null,
      transcript: '',
      reply: null,
    }
  }
  await ctx.runMutation(internal.api.voice.save, {
    threadId: spoken.threadId,
    heard: spoken.heard,
    reply: spoken.reply,
    agentName: (spoken.bot ?? spoken.project).name,
  })
  let callId: Id<'calls'> = await ctx.runMutation(internal.api.calls.addLine, {
    callId: fast.callId,
    projectId: fast.projectId,
    botId: fast.botId,
    threadId: spoken.threadId,
    who: 'you',
    text: spoken.heard,
    afterCutOff: fast.interrupted,
  })
  if (spoken.reply) {
    callId = await ctx.runMutation(internal.api.calls.addLine, {
      callId,
      projectId: fast.projectId,
      threadId: spoken.threadId,
      who: 'them',
      text: spoken.reply,
      ms: Date.now() - fast.started,
      firstMs,
    })
  }
  return {
    threadId: spoken.threadId,
    callId,
    transcript: spoken.heard,
    reply: spoken.reply || null,
  }
}

type Answered = {
  projectId: Id<'projects'>
  threadId: string
  botId?: Id<'bots'>
  from: string
  message: string
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
    const text = `Hi, it's ${call.from} with your reminder. ${call.message}`
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
    return {
      ...call,
      text,
      callId,
      audioUrl: await speak(ctx, text, call.from),
    }
  },
})

export const callsApi = { post, forget, turn, answer }
