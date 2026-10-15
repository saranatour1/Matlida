import {
  listUIMessages,
  saveMessage,
  syncStreams,
  vStreamArgs,
} from '@convex-dev/agent'
import { zid } from 'convex-helpers/server/zod4'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { z } from 'zod'
import { components, internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import { internalAction, internalQuery, query } from '../../_generated/server'
import { zMutation } from '../../lib/functions'
import schema from '../../schema'
import { getTeam } from '../employees/functions'
import { startThread } from './functions'
import { createLead } from './lead'

/**
 * Saves the user's message, starting a chat on the first one, and schedules the
 * lead's reply. Public and unauthenticated: every call spends gateway credits.
 */
const sendMessage = zMutation({
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
    const threadId =
      args.threadId ??
      (await startThread(ctx, {
        projectId,
        kind: 'chat',
        title: prompt.slice(0, 60),
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
  }),
  handler: async (ctx, { threadId }) => {
    const thread = await ctx.db
      .query('threads')
      .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
      .unique()
    const project = thread && (await ctx.db.get('projects', thread.projectId))
    if (!project) throw new Error(`No project for thread ${threadId}`)
    return { project, team: await getTeam(ctx, project._id) }
  },
})

/** Streams the lead's reply into the thread. */
const respond = internalAction({
  args: { threadId: v.string(), promptMessageId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId, promptMessageId }) => {
    const {
      project,
      team,
    }: { project: Doc<'projects'>; team: Doc<'employees'>[] } =
      await ctx.runQuery(internal.chat.context, { threadId })
    const lead = createLead(project, team)
    const result = await lead.agent.streamText(
      ctx,
      { threadId },
      { promptMessageId, instructions: lead.instructions, tools: lead.tools },
      { saveStreamDeltas: true },
    )
    await result.consumeStream()
    return null
  },
})

/** A thread's messages plus in-progress stream deltas, for `useUIMessages`. */
const listMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const paginated = await listUIMessages(ctx, components.agent, args)
    const streams = await syncStreams(ctx, components.agent, args)
    return { ...paginated, streams }
  },
})

export const chatApi = { sendMessage, context, respond, listMessages }
