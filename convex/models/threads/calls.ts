import { zid } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import { z } from 'zod'
import { generateSpeech } from 'ai'
import { internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import { speechModel } from '../../lib/ai'
import { zAuthedAction } from '../../lib/functions'
import { voiceFor } from '../../lib/models'
import { takePieces } from '../../lib/sentences'
import { gatewayCost } from '../usage/functions'
import { postMessage, runReply, transcribeClip, zTimeZone } from './chat'
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
  },
  handler: async (
    ctx,
    { storageId, timeZone, interrupted, liveKey, ...where },
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
