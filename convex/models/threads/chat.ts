import {
  listUIMessages,
  saveMessage,
  syncStreams,
  vStreamArgs,
} from '@convex-dev/agent'
import { zid } from 'convex-helpers/server/zod4'
import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { transcribe as transcribeAudio } from 'ai'
import { components, internal } from '../../_generated/api'
import { internalAction, internalQuery } from '../../_generated/server'
import { transcriptionModel } from '../../lib/ai'
import {
  authedAction,
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import schema from '../../schema'
import { getBots } from '../bots/functions'
import { findCommand } from '../commands/functions'
import { getOwnedProject } from '../projects/functions'
import { MODEL_ID } from '../../lib/models'
import { getOwnedThread, startThread } from './functions'
import { createBot, createLead } from './lead'
import type { Via } from './lead'
import type { Doc, Id } from '../../_generated/dataModel'
import type { ActionCtx, MutationCtx } from '../../_generated/server'

/** An IANA time zone the runtime knows, like Europe/London. */
export const zTimeZone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}, 'Unknown time zone.')

/**
 * Saves the user's message to a chat with `botId` (the lead when unset),
 * starting the chat on the first message. Checks that it's all `userId`'s.
 */
export async function postMessage(
  ctx: MutationCtx,
  userId: Id<'users'>,
  {
    projectId,
    botId,
    threadId,
    prompt,
    model,
  }: {
    projectId: Id<'projects'>
    botId?: Id<'bots'>
    threadId?: string
    prompt: string
    /** For a new chat: the model it starts on. */
    model?: string
  },
) {
  await getOwnedProject(ctx, userId, projectId)
  if (botId && (await ctx.db.get('bots', botId))?.projectId !== projectId) {
    throw new ConvexError('Assistant not found.')
  }
  if (threadId) {
    const thread = await getOwnedThread(ctx, userId, threadId)
    if (
      thread?.projectId !== projectId ||
      thread.kind !== 'chat' ||
      thread.botId !== botId
    ) {
      throw new ConvexError('Chat not found.')
    }
  }
  const command = await findCommand(ctx, projectId, prompt)
  const id =
    threadId ??
    (await startThread(ctx, {
      projectId,
      kind: 'chat',
      botId,
      title: prompt.slice(0, 60),
      model,
      userId,
    }))
  const { messageId } = await saveMessage(ctx, components.agent, {
    threadId: id,
    prompt,
  })
  return { threadId: id, promptMessageId: messageId, commandId: command?._id }
}

/**
 * Saves the user's message, starting a chat on the first one, and schedules
 * the reply from the chat's assistant: `botId`, or the lead when unset.
 */
const sendMessage = zAuthedMutation({
  args: {
    projectId: zid('projects'),
    threadId: z.string().optional(),
    botId: zid('bots').optional(),
    timeZone: zTimeZone.optional(),
    prompt: z
      .string()
      .trim()
      .min(1, 'Write a message first.')
      .max(4000, 'Messages can be at most 4000 characters.'),
    /** For a new chat: the model it starts on. */
    model: z
      .string()
      .trim()
      .max(80)
      .regex(MODEL_ID, 'Use a gateway model id like anthropic/claude-sonnet-5.')
      .optional(),
  },
  handler: async (ctx, { timeZone, ...message }) => {
    const { threadId, promptMessageId, commandId } = await postMessage(
      ctx,
      ctx.userId,
      message,
    )
    await ctx.scheduler.runAfter(0, internal.api.chat.respond, {
      threadId,
      promptMessageId,
      commandId,
      timeZone,
    })
    return threadId
  },
})

const context = internalQuery({
  args: { threadId: v.string(), commandId: v.optional(v.id('commands')) },
  returns: v.object({
    project: schema.doc('projects'),
    bot: v.union(schema.doc('bots'), v.null()),
    members: v.array(schema.doc('bots')),
    command: v.union(schema.doc('commands'), v.null()),
    /** The chat's own model, when one was picked. */
    model: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { threadId, commandId }) => {
    const thread = await ctx.db
      .query('threads')
      .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
      .unique()
    const project = thread && (await ctx.db.get('projects', thread.projectId))
    if (!project) throw new Error(`No project for thread ${threadId}`)
    const command = commandId && (await ctx.db.get('commands', commandId))
    const bot = thread.botId ? await ctx.db.get('bots', thread.botId) : null
    const bots = await getBots(ctx, project._id)
    return {
      project,
      bot,
      members: thread.memberIds
        ? bots.filter((b) => thread.memberIds?.includes(b._id))
        : bot
          ? []
          : bots,
      command: command && command.projectId === project._id ? command : null,
      model: thread.model ?? null,
    }
  },
})

/**
 * Streams the reply from the thread's assistant into the thread, and returns
 * its text. `via` decides how it's written: for the chat, or out loud.
 */
export async function runReply(
  ctx: ActionCtx,
  {
    threadId,
    promptMessageId,
    commandId,
    timeZone,
    via,
    cutOff,
    onText,
  }: {
    threadId: string
    promptMessageId: string
    commandId?: Id<'commands'>
    timeZone?: string
    via?: Via
    /** On a call: the user talked over the last reply. */
    cutOff?: boolean
    /** Each piece of the reply's text as it streams, with who is replying. */
    onText?: (
      delta: string,
      who: { project: Doc<'projects'>; bot: Doc<'bots'> | null },
    ) => void
  },
) {
  const {
    project,
    bot,
    members,
    command,
    model,
  }: {
    project: Doc<'projects'>
    bot: Doc<'bots'> | null
    members: Array<Doc<'bots'>>
    command: Doc<'commands'> | null
    model: string | null
  } = await ctx.runQuery(internal.api.chat.context, { threadId, commandId })
  const markdown =
    command && (await (await ctx.storage.get(command.storageId))?.text())
  const { agent, tools } = bot
    ? createBot(project, bot, members, {
        timeZone,
        via,
        cutOff,
        model: model ?? undefined,
      })
    : createLead(project, members, {
        timeZone,
        via,
        cutOff,
        model: model ?? undefined,
        command:
          command && markdown ? { name: command.name, markdown } : undefined,
      })
  const started = Date.now()
  const result = await agent.streamText(
    ctx,
    { threadId, userId: project.ownerId },
    { promptMessageId, tools },
    { saveStreamDeltas: true },
  )
  if (onText) {
    for await (const delta of result.textStream) onText(delta, { project, bot })
  }
  await result.consumeStream()
  await ctx.runMutation(internal.api.usage.record, {
    projectId: project._id,
    threadId,
    kind: 'compute',
    label: bot?.name ?? project.name,
    aiCost: 0,
    inputTokens: 0,
    outputTokens: 0,
    computeMs: Date.now() - started,
  })
  return { text: await result.text, project, bot }
}

/** Streams the reply from the thread's assistant into the thread. */
const respond = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    commandId: v.optional(v.id('commands')),
    timeZone: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await runReply(ctx, args)
    return null
  },
})

/** A thread's messages plus in-progress stream deltas, for `useUIMessages`. */
const listMessages = authedQuery({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    if (!(await getOwnedThread(ctx, ctx.userId, args.threadId))) {
      throw new ConvexError('Chat not found.')
    }
    const paginated = await listUIMessages(ctx, components.agent, args)
    const streams = await syncStreams(ctx, components.agent, args)
    return { ...paginated, streams }
  },
})

/** Where the browser uploads a voice recording before `transcribe`. */
const voiceUploadUrl = authedMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
})

/** Transcribes an uploaded recording, then deletes it. Returns the text and the gateway's metadata. */
export async function transcribeClip(
  ctx: ActionCtx,
  storageId: Id<'_storage'>,
) {
  const audio = await ctx.storage.get(storageId)
  await ctx.storage.delete(storageId)
  if (!audio) throw new ConvexError('The recording was lost. Try again.')
  if (audio.size > 10 * 1024 * 1024) {
    throw new ConvexError('Recordings can be at most 10 MB.')
  }
  const { text, providerMetadata } = await transcribeAudio({
    model: transcriptionModel,
    audio: new Uint8Array(await audio.arrayBuffer()),
  })
  return { text: text.trim(), providerMetadata }
}

/** Turns an uploaded voice recording into text, then deletes the recording. */
const transcribe = authedAction({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) =>
    (await transcribeClip(ctx, storageId)).text,
})

export const chatApi = {
  sendMessage,
  context,
  respond,
  listMessages,
  voiceUploadUrl,
  transcribe,
}
