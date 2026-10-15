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
import { components, internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import {
  internalAction,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { MAX_TEAM } from './employees'
import schema from './schema'
import { startThread } from './threads'

// ponytail: one model for every lead and employee, make it a project setting when needed.
const languageModel = convexGateway('anthropic/claude-sonnet-4.5')

type Project = Doc<'projects'>
type Employee = Doc<'employees'>

// Appended to the lead's and every employee's instructions.
function guidelines(project: Project) {
  return project.guidelines
    ? `\nProject guidelines, which always apply:\n${project.guidelines}`
    : ''
}

// Built per reply, so the lead always works with the current project and team.
function leadTools(project: Project, team: Employee[]): ToolSet {
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
        projectId: project._id,
        threadId: ctx.threadId,
        title,
        content,
      })
      return { id, title }
    },
  })
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
    // ponytail: a fresh thread per ask, so employees have no memory and the lead passes
    // context in the question. Reuse one thread per (chat, employee) if they need memory.
    execute: async (ctx, { employee, question }, { abortSignal }) => {
      const e = byName.get(employee)!
      const threadId = await ctx.runMutation(internal.threads.start, {
        projectId: project._id,
        kind: 'employee',
        title: `${project.name} → ${e.name}`,
        parentThreadId: ctx.threadId,
      })
      const agent = new Agent(components.agent, {
        name: e.name,
        languageModel,
        instructions:
          [
            `You are ${e.name}, ${e.role}, reporting to ${project.name}.`,
            e.instructions,
            ...e.fields.map((f) => `${f.label}: ${f.value}`),
          ].join('\n') + guidelines(project),
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

function leadInstructions(project: Project, team: Employee[]) {
  const delegation = team.length
    ? `Your team:
${team.map((e) => `- ${e.name}: ${e.role}`).join('\n')}

For anything beyond small talk, consult the relevant employees with ask_employee. Ask several in parallel when the topic spans their areas. Then combine what they said into one clear answer, crediting people by name and resolving disagreements yourself.`
    : 'You have no employees yet. Answer yourself, and suggest the user adds people on the Team page.'
  return `You are ${project.name}, who leads this project. The user is your partner.
${project.brief ? `About the project: ${project.brief}\n` : ''}${delegation}
When the result is a deliverable (plan, brief, spec, email draft, table), save it with save_artifact and reply with a short summary instead of repeating it. Keep replies concise and use markdown.${guidelines(project)}`
}

// Public and unauthenticated, like the template's /api/chat: every call spends gateway credits.
export const sendMessage = mutation({
  args: {
    projectId: v.id('projects'),
    threadId: v.optional(v.string()),
    prompt: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const prompt = args.prompt.trim()
    if (!prompt || prompt.length > 4000) {
      throw new ConvexError('Messages must be 1 to 4000 characters.')
    }
    const threadId =
      args.threadId ??
      (await startThread(ctx, {
        projectId: args.projectId,
        kind: 'chat',
        title: prompt.slice(0, 60),
      }))
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

export const context = internalQuery({
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
    const team = await ctx.db
      .query('employees')
      .withIndex('by_project_and_name', (q) => q.eq('projectId', project._id))
      .take(MAX_TEAM)
    return { project, team }
  },
})

export const respond = internalAction({
  args: { threadId: v.string(), promptMessageId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId, promptMessageId }) => {
    const { project, team }: { project: Project; team: Employee[] } =
      await ctx.runQuery(internal.matilda.context, { threadId })
    const lead = new Agent(components.agent, {
      name: project.name,
      languageModel,
      stopWhen: stepCountIs(6),
    })
    const result = await lead.streamText(
      ctx,
      { threadId },
      {
        promptMessageId,
        instructions: leadInstructions(project, team),
        tools: leadTools(project, team),
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
