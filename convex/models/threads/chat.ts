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
import { getOwnedThread, startThread } from './functions'
import { createBot, createLead } from './lead'
import type { Doc } from '../../_generated/dataModel'

/**
 * Saves the user's message, starting a chat on the first one, and schedules
 * the reply from the chat's assistant: `botId`, or the lead when unset.
 */
const sendMessage = zAuthedMutation({
  args: {
    projectId: zid('projects'),
    threadId: z.string().optional(),
    botId: zid('bots').optional(),
    prompt: z
      .string()
      .trim()
      .min(1, 'Write a message first.')
      .max(4000, 'Messages can be at most 4000 characters.'),
  },
  handler: async (ctx, { projectId, botId, prompt, ...args }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    if (botId && (await ctx.db.get('bots', botId))?.projectId !== projectId) {
      throw new ConvexError('Assistant not found.')
    }
    if (args.threadId) {
      const thread = await getOwnedThread(ctx, ctx.userId, args.threadId)
      if (
        thread?.projectId !== projectId ||
        thread.kind !== 'chat' ||
        thread.botId !== botId
      ) {
        throw new ConvexError('Chat not found.')
      }
    }
    const command = await findCommand(ctx, projectId, prompt)
    const threadId =
      args.threadId ??
      (await startThread(ctx, {
        projectId,
        kind: 'chat',
        botId,
        title: prompt.slice(0, 60),
        userId: ctx.userId,
      }))
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      prompt,
    })
    await ctx.scheduler.runAfter(0, internal.api.chat.respond, {
      threadId,
      promptMessageId: messageId,
      commandId: command?._id,
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
    }
  },
})

/** Streams the reply from the thread's assistant into the thread. */
const respond = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    commandId: v.optional(v.id('commands')),
  },
  returns: v.null(),
  handler: async (ctx, { threadId, promptMessageId, commandId }) => {
    const {
      project,
      bot,
      members,
      command,
    }: {
      project: Doc<'projects'>
      bot: Doc<'bots'> | null
      members: Array<Doc<'bots'>>
      command: Doc<'commands'> | null
    } = await ctx.runQuery(internal.api.chat.context, { threadId, commandId })
    const markdown =
      command && (await (await ctx.storage.get(command.storageId))?.text())
    const { agent, tools } = bot
      ? createBot(project, bot, members)
      : createLead(project, members, {
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

/** Turns an uploaded voice recording into text, then deletes the recording. */
const transcribe = authedAction({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) => {
    const audio = await ctx.storage.get(storageId)
    await ctx.storage.delete(storageId)
    if (!audio) throw new ConvexError('The recording was lost. Try again.')
    if (audio.size > 10 * 1024 * 1024) {
      throw new ConvexError('Recordings can be at most 10 MB.')
    }
    const { text } = await transcribeAudio({
      model: transcriptionModel,
      audio: new Uint8Array(await audio.arrayBuffer()),
    })
    return text.trim()
  },
})

export const chatApi = {
  sendMessage,
  context,
  respond,
  listMessages,
  voiceUploadUrl,
  transcribe,
}
