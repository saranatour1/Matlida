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
import { budgetMessage, metered } from '../../lib/budget'
import {
  authedAction,
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import schema from '../../schema'
import { findCommand, getCommand } from '../commands/queries'
import { BUILT_IN_COMMANDS } from '../../lib/commands'
import { getOwnedProject } from '../projects/queries'
import { MODELS } from '../../lib/models'
import { gatewayCost } from '../usage/functions'
import { ensureMainThread } from './functions'
import { assistantOf, getMembers, ownsThread } from './queries'
import { createAgent } from './lead'
import type { Language } from '../../lib/models'
import type { Via } from './lead'
import type { ActionCtx, Doc, Id, MutationCtx } from '../../lib/ctx'

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
export const postMessage = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  {
    projectId,
    botId,
    prompt,
  }: {
    projectId: Id<'projects'>
    botId?: Id<'bots'>
    prompt: string
  },
) => {
  const project = await getOwnedProject(ctx, userId, projectId)
  const bot = botId ? await ctx.db.get('bots', botId) : null
  if (botId && bot?.projectId !== projectId) {
    throw new ConvexError('Assistant not found.')
  }
  const command = await findCommand(ctx, projectId, prompt)
  const id = await ensureMainThread(ctx, project, bot)
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
 * Saves your time zone (when it changed) and the assistant you last messaged
 * (on `userActivity`, at most every 10 minutes), so most messages write nothing.
 */
const noteChat = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  {
    projectId,
    botId,
    timeZone,
  }: { projectId: Id<'projects'>; botId?: Id<'bots'>; timeZone?: string },
) => {
  const now = Date.now()
  const last = await ctx.db
    .query('userActivity')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
  if (!last) {
    await ctx.db.insert('userActivity', { userId, projectId, botId, at: now })
  } else if (
    last.projectId !== projectId ||
    last.botId !== botId ||
    now - last.at > 10 * 60_000
  ) {
    await ctx.db.patch('userActivity', last._id, { projectId, botId, at: now })
  }
  if (!timeZone) return
  const user = await ctx.db.get('users', userId)
  if (user && user.timeZone !== timeZone) {
    await ctx.db.patch('users', userId, { timeZone })
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
  },
  handler: async (ctx, { timeZone, ...message }) => {
    await noteChat(ctx, ctx.userId, { ...message, timeZone })
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
  }),
  handler: async (ctx, { threadId, command: name }) => {
    const found = await assistantOf(ctx, threadId)
    if (!found) throw new Error(`No project for thread ${threadId}`)
    const { project, bot } = found
    const stored = name ? await getCommand(ctx, project._id, name) : null
    const builtIn = BUILT_IN_COMMANDS.find((c) => c.name === name)
    return {
      project,
      bot,
      members: await getMembers(ctx, project, bot),
      command: stored
        ? { name: stored.name, storageId: stored.storageId }
        : builtIn
          ? { name: builtIn.name, markdown: builtIn.markdown }
          : null,
    }
  },
})

/**
 * Streams the reply from the thread's assistant into the thread, and returns
 * its text. `via` decides how it's written: for the chat, or out loud.
 */
export const runReply = async (
  ctx: ActionCtx,
  {
    threadId,
    promptMessageId,
    command: commandName,
    timeZone,
    via,
    cutOff,
    language,
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
    /** On a call: the language to speak. */
    language?: Language
    /** Each piece of the reply's text as it streams, with who is replying. */
    onText?: (
      delta: string,
      who: { project: Doc<'projects'>; bot: Doc<'bots'> | null },
    ) => void
  },
) => {
  const {
    project,
    bot,
    members,
    command,
  }: {
    project: Doc<'projects'>
    bot: Doc<'bots'> | null
    members: Array<Doc<'bots'>>
    command: {
      name: string
      markdown?: string
      storageId?: Id<'_storage'>
    } | null
  } = await ctx.runQuery(internal.api.chat.context, {
    threadId,
    command: commandName,
  })
  const markdown =
    command?.markdown ??
    (command?.storageId &&
      (await (await ctx.storage.get(command.storageId))?.text()))
  const agent = createAgent(ctx, project, {
    bot,
    members,
    timeZone,
    via,
    cutOff,
    language,
    command: command && markdown ? { name: command.name, markdown } : undefined,
  })
  const started = Date.now()
  let text: string
  try {
    const result = await agent.streamText(
      ctx,
      { threadId, userId: project.ownerId },
      { promptMessageId },
      { saveStreamDeltas: true },
    )
    if (onText) {
      for await (const delta of result.textStream) {
        onText(delta, { project, bot })
      }
    }
    await result.consumeStream()
    text = await result.text
  } catch (error) {
    // Over the month's budget: the chat says so, and a call reads it out.
    const refused = budgetMessage(error)
    if (!refused) throw error
    await saveMessage(ctx, components.agent, {
      threadId,
      message: { role: 'assistant', content: refused },
    })
    onText?.(refused, { project, bot })
    text = refused
  }
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
  return { text, project, bot }
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
    if (!(await ownsThread(ctx, ctx.userId, args.threadId))) {
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
export const transcribeClip = async (
  ctx: ActionCtx,
  userId: Id<'users'>,
  storageId: Id<'_storage'>,
  /** What's spoken, as an ISO 639-1 code, when the user set it. */
  language?: Language,
) => {
  const audio = await ctx.storage.get(storageId)
  await ctx.storage.delete(storageId)
  if (!audio) throw new ConvexError('The recording was lost. Try again.')
  if (audio.size > 10 * 1024 * 1024) {
    throw new ConvexError('Recordings can be at most 10 MB.')
  }
  const { text, providerMetadata } = await metered(
    ctx,
    { userId, model: MODELS.transcription, estimate: 0.01 },
    async () => {
      const heard = await transcribeAudio({
        model: transcriptionModel,
        audio: new Uint8Array(await audio.arrayBuffer()),
        ...(language && { providerOptions: { convexGateway: { language } } }),
      })
      return { result: heard, cost: gatewayCost(heard.providerMetadata) }
    },
  )
  return { text: text.trim(), providerMetadata }
}

/** Turns an uploaded voice recording into text, then deletes the recording. */
const transcribe = authedAction({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) =>
    (await transcribeClip(ctx, ctx.userId, storageId)).text,
})

export const chatApi = {
  sendMessage,
  context,
  respond,
  listMessages,
  voiceUploadUrl,
  transcribe,
}
