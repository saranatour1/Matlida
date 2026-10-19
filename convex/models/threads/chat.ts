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
import { components, internal } from '../../_generated/api'
import { internalAction, internalQuery } from '../../_generated/server'
import { authedQuery, zAuthedMutation } from '../../lib/functions'
import schema from '../../schema'
import { getBots } from '../bots/functions'
import { findCommand } from '../commands/functions'
import { getOwnedProject } from '../projects/functions'
import { getOwnedThread, startThread } from './functions'
import { createLead } from './lead'
import type { Doc } from '../../_generated/dataModel'

/**
 * Saves the user's message, starting a chat on the first one, and schedules
 * the lead's reply.
 */
const sendMessage = zAuthedMutation({
  args: {
    projectId: zid('projects'),
    threadId: z.string().optional(),
    prompt: z
      .string()
      .trim()
      .min(1, 'Write a message first.')
      .max(4000, 'Messages can be at most 4000 characters.'),
  },
  handler: async (ctx, { projectId, prompt, ...args }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    if (args.threadId) {
      const thread = await getOwnedThread(ctx, ctx.userId, args.threadId)
      if (thread?.projectId !== projectId || thread.kind !== 'chat') {
        throw new ConvexError('Chat not found.')
      }
    }
    const command = await findCommand(ctx, projectId, prompt)
    const threadId =
      args.threadId ??
      (await startThread(ctx, {
        projectId,
        kind: 'chat',
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
    bots: v.array(schema.doc('bots')),
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
    return {
      project,
      bots: await getBots(ctx, project._id),
      command: command && command.projectId === project._id ? command : null,
    }
  },
})

/** Streams the lead's reply into the thread. */
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
      bots,
      command,
    }: {
      project: Doc<'projects'>
      bots: Array<Doc<'bots'>>
      command: Doc<'commands'> | null
    } = await ctx.runQuery(internal.api.chat.context, { threadId, commandId })
    const markdown =
      command && (await (await ctx.storage.get(command.storageId))?.text())
    const lead = createLead(
      project,
      bots,
      command && markdown ? { name: command.name, markdown } : undefined,
    )
    const result = await lead.agent.streamText(
      ctx,
      { threadId, userId: project.ownerId },
      { promptMessageId, tools: lead.tools },
      { saveStreamDeltas: true },
    )
    await result.consumeStream()
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

export const chatApi = { sendMessage, context, respond, listMessages }
