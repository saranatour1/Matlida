import { zid } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import { z } from 'zod'
import { generateSpeech } from 'ai'
import { internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import { speechModel } from '../../lib/ai'
import { zAuthedAction } from '../../lib/functions'
import { voiceFor } from '../../lib/models'
import { gatewayCost } from '../usage/functions'
import { postMessage, runReply, transcribeClip, zTimeZone } from './chat'

/** How long a spoken reply stays in storage, long enough to play it. */
const AUDIO_TTL_MS = 10 * 60_000

/** `postMessage` for a call turn, which runs in an action. */
const post = internalMutation({
  args: {
    userId: v.id('users'),
    projectId: v.id('projects'),
    botId: v.optional(v.id('bots')),
    threadId: v.optional(v.string()),
    prompt: v.string(),
  },
  returns: v.object({
    threadId: v.string(),
    promptMessageId: v.string(),
    commandId: v.optional(v.id('commands')),
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

type Turn = {
  threadId: string | null
  transcript: string
  reply: string | null
  audioUrl: string | null
}

/**
 * One turn of a voice call: transcribes what the user said, saves it to the
 * chat, lets the chat's assistant answer as it would in the chat but written
 * to be spoken, then speaks the answer. Silence gets no reply.
 */
const turn = zAuthedAction({
  args: {
    projectId: zid('projects'),
    botId: zid('bots').optional(),
    threadId: z.string().optional(),
    storageId: zid('_storage'),
    timeZone: zTimeZone.optional(),
  },
  handler: async (ctx, { storageId, timeZone, ...where }): Promise<Turn> => {
    const heard = await transcribeClip(ctx, storageId)
    if (!heard.text) {
      return {
        threadId: where.threadId ?? null,
        transcript: '',
        reply: null,
        audioUrl: null,
      }
    }
    const posted = await ctx.runMutation(internal.api.calls.post, {
      userId: ctx.userId,
      ...where,
      prompt: heard.text.slice(0, 4000),
    })
    await ctx.runMutation(internal.api.usage.record, {
      projectId: where.projectId,
      threadId: posted.threadId,
      kind: 'voice',
      label: 'Listening',
      aiCost: gatewayCost(heard.providerMetadata),
      inputTokens: 0,
      outputTokens: 0,
    })
    const { text, project, bot } = await runReply(ctx, {
      ...posted,
      timeZone,
      via: 'voice',
    })
    if (!text.trim()) {
      return {
        threadId: posted.threadId,
        transcript: heard.text,
        reply: null,
        audioUrl: null,
      }
    }
    const { audio } = await generateSpeech({
      model: speechModel,
      text: text.slice(0, 2000),
      voice: voiceFor((bot ?? project).name),
    })
    const audioId = await ctx.storage.store(
      new Blob([new Uint8Array(audio.uint8Array)], { type: audio.mediaType }),
    )
    await ctx.scheduler.runAfter(AUDIO_TTL_MS, internal.api.calls.forget, {
      storageId: audioId,
    })
    return {
      threadId: posted.threadId,
      transcript: heard.text,
      reply: text,
      audioUrl: await ctx.storage.getUrl(audioId),
    }
  },
})

export const callsApi = { post, forget, turn }
