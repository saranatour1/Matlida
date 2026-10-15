import {
  Agent,
  listUIMessages,
  saveMessage,
  syncStreams,
  vStreamArgs,
} from '@convex-dev/agent'
import { convexGateway } from '@convex-dev/ai-sdk-provider'
import { zid } from 'convex-helpers/server/zod4'
import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { components, internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import { internalAction, internalQuery } from '../../_generated/server'
import { GATEWAY_MODEL, isKeyRejected, resolveModel } from '../../lib/ai'
import { PROVIDERS } from '../aiConnections/providers'
import {
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import schema from '../../schema'
import { getTeam } from '../employees/functions'
import { getOwnedProject } from '../projects/functions'
import { getOwnedThread, startThread } from './functions'
import { createLead } from './lead'

/**
 * Saves the user's message, starting a chat on the first one, and schedules the
 * lead's reply. Public and unauthenticated: every call spends gateway credits.
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
      if (thread?.projectId !== projectId) {
        throw new ConvexError('Chat not found.')
      }
    }
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
    await ctx.scheduler.runAfter(0, internal.chat.respond, {
      threadId,
      promptMessageId: messageId,
    })
    return threadId
  },
})

const context = internalQuery({
  args: { threadId: v.string() },
  returns: v.object({
    project: schema.doc('projects'),
    team: v.array(schema.doc('employees')),
    connection: v.union(schema.doc('aiConnections'), v.null()),
    emails: v.array(schema.doc('emailConnections')),
  }),
  handler: async (ctx, { threadId }) => {
    const thread = await ctx.db
      .query('threads')
      .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
      .unique()
    const project = thread && (await ctx.db.get('projects', thread.projectId))
    if (!project) throw new Error(`No project for thread ${threadId}`)
    return {
      project,
      team: await getTeam(ctx, project._id),
      connection: project.aiConnectionId
        ? await ctx.db.get('aiConnections', project.aiConnectionId)
        : null,
      emails: (
        await ctx.db
          .query('emailConnections')
          .withIndex('by_owner', (q) => q.eq('ownerId', project.ownerId))
          .take(20)
      ).filter((c) => c.status === 'valid'),
    }
  },
})

/**
 * Streams the lead's reply into the thread. When the owner's provider rejects
 * their key, the connection is marked invalid and the thread says so.
 */
const respond = internalAction({
  args: { threadId: v.string(), promptMessageId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId, promptMessageId }) => {
    const {
      project,
      team,
      connection,
      emails,
    }: {
      project: Doc<'projects'>
      team: Doc<'employees'>[]
      connection: Doc<'aiConnections'> | null
      emails: Doc<'emailConnections'>[]
    } = await ctx.runQuery(internal.chat.context, { threadId })
    const lead = createLead({
      project,
      team,
      model: await resolveModel(project, connection),
      emails,
    })
    let keyRejected = false
    const result = await lead.agent.streamText(
      ctx,
      { threadId, userId: project.ownerId },
      {
        promptMessageId,
        instructions: lead.instructions,
        tools: lead.tools,
        onError: ({ error }) => {
          keyRejected ||= isKeyRejected(error)
        },
      },
      { saveStreamDeltas: true },
    )
    await result.consumeStream()
    if (keyRejected && connection) {
      await ctx.runMutation(internal.aiConnections.markInvalid, {
        id: connection._id,
      })
      await saveMessage(ctx, components.agent, {
        threadId,
        message: {
          role: 'assistant',
          content: `${PROVIDERS[connection.provider].name} rejected the API key in "${connection.label}". Update it in Settings, or switch this project to the Convex AI Gateway.`,
        },
      })
    }
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

/**
 * Records the user's answer to a tool call the lead paused on (sending email),
 * then lets the lead continue. Approved calls run; denied ones are skipped.
 */
const decide = authedMutation({
  args: { threadId: v.string(), approvalId: v.string(), approved: v.boolean() },
  handler: async (ctx, { threadId, approvalId, approved }) => {
    if (!(await getOwnedThread(ctx, ctx.userId, threadId))) {
      throw new ConvexError('Chat not found.')
    }
    const recorder = new Agent(components.agent, {
      name: 'approvals',
      languageModel: convexGateway(GATEWAY_MODEL),
    })
    const { messageId } = approved
      ? await recorder.approveToolCall(ctx, { threadId, approvalId })
      : await recorder.denyToolCall(ctx, {
          threadId,
          approvalId,
          reason: 'The user chose not to send it.',
        })
    await ctx.scheduler.runAfter(0, internal.chat.respond, {
      threadId,
      promptMessageId: messageId,
    })
  },
})

export const chatApi = {
  sendMessage,
  context,
  respond,
  listMessages,
  decide,
}
