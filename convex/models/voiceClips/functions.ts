import { listMessages, saveMessage } from '@convex-dev/agent'
import { zid } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { components, internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import { audioChat, audioVoiceFor, pcmToWav } from '../../lib/audio'
import { authedQuery, zAuthedAction } from '../../lib/functions'
import schema from '../../schema'
import { getOwnedProject } from '../projects/functions'
import { transcribeClip, zTimeZone } from '../threads/chat'
import { ensureMainThread, getOwnedThread } from '../threads/functions'
import { instructionsFor } from '../threads/lead'
import { gatewayCost } from '../usage/functions'
import type { Doc, Id } from '../../_generated/dataModel'
import type { ActionCtx } from '../../_generated/server'

/** The assistant's one chat, where a voice turn goes, and who answers. */
const prepare = internalMutation({
  args: {
    userId: v.id('users'),
    projectId: v.id('projects'),
    botId: v.optional(v.id('bots')),
  },
  returns: v.object({
    threadId: v.string(),
    project: schema.doc('projects'),
    bot: v.union(schema.doc('bots'), v.null()),
  }),
  handler: async (ctx, { userId, projectId, botId }) => {
    const project = await getOwnedProject(ctx, userId, projectId)
    const bot = botId ? await ctx.db.get('bots', botId) : null
    if (botId && bot?.projectId !== projectId) {
      throw new ConvexError('Assistant not found.')
    }
    const threadId = await ensureMainThread(ctx, project, bot)
    return { threadId, project, bot }
  },
})

/** Saves a voice turn to the chat, with the clips to play on each message. */
const save = internalMutation({
  args: {
    threadId: v.string(),
    heard: v.string(),
    reply: v.string(),
    agentName: v.string(),
    heardClip: v.optional(v.id('_storage')),
    replyClip: v.optional(v.id('_storage')),
  },
  returns: v.null(),
  handler: async (ctx, { threadId, heard, reply, agentName, ...clips }) => {
    const said = await saveMessage(ctx, components.agent, {
      threadId,
      message: { role: 'user', content: heard },
    })
    if (clips.heardClip) {
      await ctx.db.insert('voiceClips', {
        threadId,
        messageId: said.messageId,
        storageId: clips.heardClip,
      })
    }
    const answered = await saveMessage(ctx, components.agent, {
      threadId,
      agentName,
      message: { role: 'assistant', content: reply },
    })
    if (clips.replyClip) {
      await ctx.db.insert('voiceClips', {
        threadId,
        messageId: answered.messageId,
        storageId: clips.replyClip,
      })
    }
    return null
  },
})

/** The chat so far as text, oldest first, for the audio model. */
async function history(ctx: ActionCtx, threadId: string) {
  const { page } = await listMessages(ctx, components.agent, {
    threadId,
    paginationOpts: { numItems: 20, cursor: null },
    excludeToolMessages: true,
  })
  return page
    .sort((a, b) => a.order - b.order || a.stepOrder - b.stepOrder)
    .flatMap((m) => {
      const role = m.message?.role
      const content = m.text?.trim()
      return content && (role === 'user' || role === 'assistant')
        ? [{ role, content }]
        : []
    })
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function concat(chunks: Array<Uint8Array>) {
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const chunk of chunks) {
    all.set(chunk, at)
    at += chunk.length
  }
  return all
}

export type SpokenTurn = {
  threadId: string
  project: Doc<'projects'>
  bot: Doc<'bots'> | null
  /** What you said, transcribed. Empty when nothing was heard. */
  heard: string
  reply: string
}

/**
 * One spoken turn with an audio chat model, without tools: it hears the WAV
 * recording `storageId` after the chat so far and answers in voice, passing
 * the audio to `onAudio` as it streams. What you said is transcribed at the
 * same time, for the chat; when that comes back empty the answer is
 * cancelled, so silence gets no reply. Saving is up to the caller.
 */
export async function speakWith(
  ctx: ActionCtx,
  turn: {
    userId: Id<'users'>
    projectId: Id<'projects'>
    botId?: Id<'bots'>
    storageId: Id<'_storage'>
    timeZone?: string
    cutOff?: boolean
    /** Keep the recording after transcribing it, to play in the chat. */
    keep?: boolean
    onHeard?: (text: string) => Promise<unknown>
    onAudio: (pcm: Uint8Array, transcript: string) => Promise<void> | void
  },
): Promise<SpokenTurn> {
  const { threadId, project, bot } = await ctx.runMutation(
    internal.api.voiceClips.prepare,
    { userId: turn.userId, projectId: turn.projectId, botId: turn.botId },
  )
  const recording = await ctx.storage.get(turn.storageId)
  if (!recording) throw new ConvexError('The recording was lost. Try again.')
  if (recording.size > 10 * 1024 * 1024) {
    throw new ConvexError('Recordings can be at most 10 MB.')
  }
  const audio = toBase64(new Uint8Array(await recording.arrayBuffer()))
  const said = await history(ctx, threadId)
  const name = (bot ?? project).name
  const stop = new AbortController()
  const hearing = transcribeClip(ctx, turn.storageId, turn.keep).then(
    async (heard) => {
      if (!heard.text) stop.abort()
      await turn.onHeard?.(heard.text)
      return heard
    },
  )
  const answering = audioChat(
    {
      instructions: instructionsFor(project, bot, {
        via: 'voice',
        timeZone: turn.timeZone,
        cutOff: turn.cutOff,
      }),
      history: said,
      audio,
      format: 'wav',
      voice: audioVoiceFor(name),
    },
    turn.onAudio,
    stop.signal,
  ).catch((error: unknown) => {
    if (stop.signal.aborted) return null
    throw error
  })
  const [heard, answer] = await Promise.all([hearing, answering])
  if (heard.text) {
    await ctx.runMutation(internal.api.usage.record, {
      projectId: project._id,
      threadId,
      kind: 'voice',
      label: 'Listening',
      aiCost: gatewayCost(heard.providerMetadata),
      inputTokens: 0,
      outputTokens: 0,
    })
  }
  if (answer) {
    await ctx.runMutation(internal.api.usage.record, {
      projectId: project._id,
      threadId,
      kind: 'voice',
      label: `${name} (audio chat)`,
      aiCost: answer.cost,
      inputTokens: answer.inputTokens,
      outputTokens: answer.outputTokens,
    })
  }
  return {
    threadId,
    project,
    bot,
    heard: heard.text,
    reply: answer?.transcript ?? '',
  }
}

/**
 * A voice note in the chat: the assistant hears it and answers in voice. Both
 * are saved to the chat with their audio. Returns the reply's audio, to play
 * right away.
 */
const send = zAuthedAction({
  args: {
    projectId: zid('projects'),
    botId: zid('bots').optional(),
    storageId: zid('_storage'),
    timeZone: zTimeZone.optional(),
  },
  handler: async (ctx, args): Promise<{ replyUrl: string | null }> => {
    const chunks: Array<Uint8Array> = []
    const turn = await speakWith(ctx, {
      ...args,
      userId: ctx.userId,
      keep: true,
      onAudio: (pcm) => {
        chunks.push(pcm)
      },
    })
    if (!turn.heard) {
      await ctx.storage.delete(args.storageId)
      throw new ConvexError('I couldn’t hear anything. Try again.')
    }
    const replyClip = chunks.length
      ? await ctx.storage.store(
          new Blob([pcmToWav(concat(chunks))], { type: 'audio/wav' }),
        )
      : undefined
    await ctx.runMutation(internal.api.voiceClips.save, {
      threadId: turn.threadId,
      heard: turn.heard,
      reply: turn.reply,
      agentName: (turn.bot ?? turn.project).name,
      heardClip: args.storageId,
      replyClip,
    })
    return {
      replyUrl: replyClip ? await ctx.storage.getUrl(replyClip) : null,
    }
  },
})

/** The audio to play on a chat's messages, by message. */
const forThread = authedQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    if (!(await getOwnedThread(ctx, ctx.userId, threadId))) return []
    const clips = await ctx.db
      .query('voiceClips')
      .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
      .order('desc')
      .take(100)
    return await Promise.all(
      clips.map(async (clip) => ({
        messageId: clip.messageId,
        url: await ctx.storage.getUrl(clip.storageId),
      })),
    )
  },
})

export const voiceClipsApi = { prepare, save, send, forThread }
