import { Agent, createTool, stepCountIs } from '@convex-dev/agent'
import type { ToolSet } from 'ai'
import { z } from 'zod'
import { components, internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import { languageModel } from '../../lib/ai'

type Project = Doc<'projects'>
type Employee = Doc<'employees'>

/**
 * Builds a project's lead for one reply, so it always works with the current
 * project settings and team.
 */
export function createLead(project: Project, team: Employee[]) {
  const agent = new Agent(components.agent, {
    name: project.name,
    languageModel,
    stopWhen: stepCountIs(6),
  })
  return {
    agent,
    instructions: leadInstructions(project, team),
    tools: leadTools(project, team),
  }
}

function guidelines(project: Project) {
  return project.guidelines
    ? `\nProject guidelines, which always apply:\n${project.guidelines}`
    : ''
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

function employeeInstructions(project: Project, employee: Employee) {
  return (
    [
      `You are ${employee.name}, ${employee.role}, reporting to ${project.name}.`,
      employee.instructions,
      ...employee.fields.map((f) => `${f.label}: ${f.value}`),
    ].join('\n') + guidelines(project)
  )
}

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

  const [first, ...rest] = team
  if (!first) return { save_artifact: saveArtifact }

  const askEmployee = createTool({
    description:
      'Ask one employee a question or hand them a task, and get their reply. Call it several times in the same step to consult multiple employees in parallel.',
    inputSchema: z.object({
      employee: z.enum([first.name, ...rest.map((e) => e.name)]),
      question: z
        .string()
        .describe(
          'What you need from them, with all the context they need. They cannot see the chat.',
        ),
    }),
    execute: async (ctx, { employee, question }, { abortSignal }) => {
      const e = team.find((member) => member.name === employee) ?? first
      const threadId = await ctx.runMutation(internal.threads.start, {
        projectId: project._id,
        kind: 'employee',
        title: `${project.name} → ${e.name}`,
        parentThreadId: ctx.threadId,
        userId: project.ownerId,
      })
      const agent = new Agent(components.agent, {
        name: e.name,
        languageModel,
        instructions: employeeInstructions(project, e),
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
