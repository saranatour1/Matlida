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
import { findCommand, getCommand } from '../commands/functions'
import { BUILT_IN_COMMANDS } from '../../lib/commands'
import { getOwnedProject } from '../projects/functions'
import { MODEL_ID } from '../../lib/models'
import { ensureMainThread, getMembers, getOwnedThread } from './functions'
import { createAgent } from './lead'
import type { Effort } from '../../lib/models'
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
 * Saves the user's message to the one thread of `botId` (the lead when
 * unset), starting it on the first message. Checks that it's all `userId`'s.
 */
export async function postMessage(
  ctx: MutationCtx,
  userId: Id<'users'>,
  {
    projectId,
    botId,
    prompt,
    model,
    effort,
  }: {
    projectId: Id<'projects'>
    botId?: Id<'bots'>
    prompt: string
    /** For a new chat: the model it starts on. */
    model?: string
    /** For a new chat: the effort it starts on. */
    effort?: Effort
  },
) {
  const project = await getOwnedProject(ctx, userId, projectId)
  const bot = botId ? await ctx.db.get('bots', botId) : null
  if (botId && bot?.projectId !== projectId) {
    throw new ConvexError('Assistant not found.')
  }
  const command = await findCommand(ctx, projectId, prompt)
  const id = await ensureMainThread(ctx, project, bot, { model, effort })
  const { messageId } = await saveMessage(ctx, components.agent, {
    threadId: id,
    prompt,
  })
  return {
    threadId: id,
    promptMessageId: messageId,
    command: command ?? undefined,
  }
}

/**
 * Saves the user's message, starting a chat on the first one, and schedules
 * the reply from the chat's assistant: `botId`, or the lead when unset.
 */
const sendMessage = zAuthedMutation({
  args: {
    projectId: zid('projects'),
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
    /** For a new chat: the effort it starts on. */
    effort: z.enum(['low', 'medium', 'high']).optional(),
  },
  handler: async (ctx, { timeZone, ...message }) => {
    const { threadId, promptMessageId, command } = await postMessage(
      ctx,
      ctx.userId,
      message,
    )
    await ctx.scheduler.runAfter(0, internal.api.chat.respond, {
      threadId,
      promptMessageId,
      command,
      timeZone,
    })
    return threadId
  },
})

const context = internalQuery({
  args: { threadId: v.string(), command: v.optional(v.string()) },
  returns: v.object({
    project: schema.doc('projects'),
    bot: v.union(schema.doc('bots'), v.null()),
    members: v.array(schema.doc('bots')),
    /** The command the message ran, with its markdown or where it's stored. */
    command: v.union(
      v.object({
        name: v.string(),
        markdown: v.optional(v.string()),
        storageId: v.optional(v.id('_storage')),
      }),
      v.null(),
    ),
    /** The chat's own model, when one was picked. */
    model: v.union(v.string(), v.null()),
    /** The chat's own effort, when one was picked. */
    effort: v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.null(),
    ),
  }),
  handler: async (ctx, { threadId, command: name }) => {
    const thread = await ctx.db
      .query('threads')
      .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
      .unique()
    const project = thread && (await ctx.db.get('projects', thread.projectId))
    if (!project) throw new Error(`No project for thread ${threadId}`)
    const stored = name ? await getCommand(ctx, thread.projectId, name) : null
    const builtIn = BUILT_IN_COMMANDS.find((c) => c.name === name)
    const bot = thread.botId ? await ctx.db.get('bots', thread.botId) : null
    return {
      project,
      bot,
      members: await getMembers(ctx, thread),
      command: stored
        ? { name: stored.name, storageId: stored.storageId }
        : builtIn
          ? { name: builtIn.name, markdown: builtIn.markdown }
          : null,
      model: thread.model ?? null,
      effort: thread.effort ?? null,
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
    command: commandName,
    timeZone,
    via,
    cutOff,
    onText,
  }: {
    threadId: string
    promptMessageId: string
    /** The command the message ran, by name. */
    command?: string
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
    effort,
  }: {
    project: Doc<'projects'>
    bot: Doc<'bots'> | null
    members: Array<Doc<'bots'>>
    command: {
      name: string
      markdown?: string
      storageId?: Id<'_storage'>
    } | null
    model: string | null
    effort: Effort | null
  } = await ctx.runQuery(internal.api.chat.context, {
    threadId,
    command: commandName,
  })
  const markdown =
    command?.markdown ??
    (command?.storageId &&
      (await (await ctx.storage.get(command.storageId))?.text()))
  const agent = createAgent(project, {
    bot,
    members,
    timeZone,
    via,
    cutOff,
    model: model ?? undefined,
    effort: effort ?? undefined,
    command: command && markdown ? { name: command.name, markdown } : undefined,
  })
  const started = Date.now()
  const result = await agent.streamText(
    ctx,
    { threadId, userId: project.ownerId },
    { promptMessageId },
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
    command: v.optional(v.string()),
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
