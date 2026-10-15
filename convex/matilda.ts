import {
  Agent,
  createTool,
  listUIMessages,
  saveMessage,
  stepCountIs,
  syncStreams,
  vStreamArgs,
} from '@convex-dev/agent'
import { convexGateway } from '@convex-dev/ai-sdk-provider'
import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { ToolSet } from 'ai'
import { z } from 'zod'
import { api, components, internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { internalAction, mutation, query } from './_generated/server'
import { startThread } from './threads'

// ponytail: one model for the whole company, give an employee its own when needed.
const languageModel = convexGateway('anthropic/claude-sonnet-4.5')

const matilda = new Agent(components.agent, {
  name: 'Matilda',
  languageModel,
  stopWhen: stepCountIs(6),
})

const saveArtifact = createTool({
  description:
    'Save a deliverable (plan, brief, spec, email draft, table) as a document the user can open from the sidebar.',
  inputSchema: z.object({
    title: z.string().describe('Short document title.'),
    content: z.string().describe('The full document in markdown.'),
  }),
  execute: async (ctx, { title, content }) => {
    if (!ctx.threadId) throw new Error('save_artifact needs a thread.')
    const id = await ctx.runMutation(internal.artifacts.save, {
      threadId: ctx.threadId,
      title,
      content,
    })
    return { id, title }
  },
})

// Built per reply, so Matilda always works with the current team.
function teamTools(team: Doc<'employees'>[]): ToolSet {
  if (team.length === 0) return { save_artifact: saveArtifact }
  const byName = new Map(team.map((e) => [e.name, e]))
  const names = team.map((e) => e.name) as [string, ...string[]]

  const askEmployee = createTool({
    description:
      'Ask one employee a question or hand them a task, and get their reply. Call it several times in the same step to consult multiple employees in parallel.',
    inputSchema: z.object({
      employee: z.enum(names),
      question: z
        .string()
        .describe(
          'What you need from them, with all the context they need. They cannot see the chat.',
        ),
    }),
    // ponytail: a fresh thread per ask, so employees have no memory and Matilda passes
    // context in the question. Reuse one thread per (chat, employee) if they need memory.
    execute: async (ctx, { employee, question }, { abortSignal }) => {
      const e = byName.get(employee)!
      const threadId = await ctx.runMutation(internal.threads.start, {
        kind: 'employee',
        title: `Matilda → ${e.name}`,
        parentThreadId: ctx.threadId,
      })
      const agent = new Agent(components.agent, {
        name: e.name,
        languageModel,
        instructions: [
          `You are ${e.name}, ${e.role}, reporting to Matilda.`,
          e.instructions,
          ...e.fields.map((f) => `${f.label}: ${f.value}`),
        ].join('\n'),
      })
      const { text } = await agent.generateText(
        ctx,
        { threadId },
        { prompt: question, abortSignal },
      )
      return { name: e.name, role: e.role, reply: text }
    },
  })

  return { save_artifact: saveArtifact, ask_employee: askEmployee }
}

function matildaInstructions(team: Doc<'employees'>[]) {
  const delegation = team.length
    ? `Your team:
${team.map((e) => `- ${e.name}: ${e.role}`).join('\n')}

For anything beyond small talk, consult the relevant employees with ask_employee. Ask several in parallel when the topic spans their areas. Then combine what they said into one clear answer, crediting people by name and resolving disagreements yourself.`
    : 'You have no employees yet. Answer yourself, and suggest the user adds people on the Team page.'
  return `You are Matilda, who runs a small company. The user is your business partner.
${delegation}
When the result is a deliverable (plan, brief, spec, email draft, table), save it with save_artifact and reply with a short summary instead of repeating it. Keep replies concise and use markdown.`
}

// Public and unauthenticated, like the template's /api/chat: every call spends gateway credits.
export const sendMessage = mutation({
  args: { threadId: v.optional(v.string()), prompt: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const prompt = args.prompt.trim()
    if (!prompt || prompt.length > 4000) {
      throw new ConvexError('Messages must be 1 to 4000 characters.')
    }
    const threadId =
      args.threadId ??
      (await startThread(ctx, { kind: 'chat', title: prompt.slice(0, 60) }))
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      prompt,
    })
    await ctx.scheduler.runAfter(0, internal.matilda.respond, {
      threadId,
      promptMessageId: messageId,
    })
    return threadId
  },
})

export const respond = internalAction({
  args: { threadId: v.string(), promptMessageId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId, promptMessageId }) => {
    const team = await ctx.runQuery(api.employees.list)
    const result = await matilda.streamText(
      ctx,
      { threadId },
      {
        promptMessageId,
        instructions: matildaInstructions(team),
        tools: teamTools(team),
      },
      { saveStreamDeltas: true },
    )
    await result.consumeStream()
    return null
  },
})

export const listMessages = query({
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
