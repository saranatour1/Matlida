import { listMessages, saveMessage } from '@convex-dev/agent'
import { ConvexError, v } from 'convex/values'
import { components, internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import { audioChat, audioVoiceFor } from '../../lib/audio'
import schema from '../../schema'
import { getOwnedProject } from '../projects/queries'
import { gatewayCost } from '../usage/functions'
import { metered } from '../../lib/budget'
import { MODELS } from '../../lib/models'
import { transcribeClip } from './chat'
import { ensureMainThread } from './functions'
import { instructionsFor } from './lead'
import type { ActionCtx, Doc, Id } from '../../lib/ctx'

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

/** Saves a spoken turn to the chat: what you said, and the assistant's answer. */
const save = internalMutation({
  args: {
    threadId: v.string(),
    heard: v.string(),
    reply: v.string(),
    agentName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { threadId, heard, reply, agentName }) => {
    await saveMessage(ctx, components.agent, {
      threadId,
      message: { role: 'user', content: heard },
    })
    if (reply) {
      await saveMessage(ctx, components.agent, {
        threadId,
        agentName,
        message: { role: 'assistant', content: reply },
      })
    }
    return null
  },
})

/** The chat so far as text, oldest first, for the audio model. */
const history = async (ctx: ActionCtx, threadId: string) => {
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

const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export const concat = (chunks: Array<Uint8Array>) => {
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
export const speakWith = async (
  ctx: ActionCtx,
  turn: {
    userId: Id<'users'>
    projectId: Id<'projects'>
    botId?: Id<'bots'>
    storageId: Id<'_storage'>
    timeZone?: string
    cutOff?: boolean
    onHeard?: (text: string) => Promise<unknown>
    onAudio: (pcm: Uint8Array, transcript: string) => Promise<void> | void
  },
): Promise<SpokenTurn> => {
  const { threadId, project, bot } = await ctx.runMutation(
    internal.api.voice.prepare,
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
  const hearing = transcribeClip(ctx, turn.userId, turn.storageId).then(
    async (heard) => {
      if (!heard.text) stop.abort()
      await turn.onHeard?.(heard.text)
      return heard
    },
  )
  const answering = metered(
    ctx,
    { userId: turn.userId, model: MODELS.audioChat, estimate: 0.05 },
    async () => {
      const spoken = await audioChat(
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
      )
      return { result: spoken, cost: spoken.cost }
    },
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
    // Nothing heard: whatever the cut-off reply started isn't kept.
    reply: heard.text ? (answer?.transcript ?? '') : '',
  }
}

export const voiceApi = { prepare, save }
