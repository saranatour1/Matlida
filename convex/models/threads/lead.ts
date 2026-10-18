import {
  Agent,
  createTool,
  stepCountIs,
  type ContextHandler,
} from '@convex-dev/agent'
import type { ModelMessage, ToolSet } from 'ai'
import { ConvexError } from 'convex/values'
import { z } from 'zod'
import { components, internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import { languageModel } from '../../lib/ai'

type Project = Doc<'projects'>
type Employee = Doc<'employees'>

/** Everything a lead needs for one reply. */
export type LeadSetup = {
  project: Project
  team: Employee[]
  /** The owner's working email connections. Empty means no email tool. */
  emails: Doc<'emailConnections'>[]
}

/**
 * Builds a project's lead for one reply, so it always works with the current
 * project settings, team and connections.
 */
export function createLead(setup: LeadSetup) {
  const agent = new Agent(components.agent, {
    name: setup.project.name,
    languageModel,
    stopWhen: stepCountIs(6),
    contextHandler: keepCurrentApprovals,
  })
  return {
    agent,
    instructions: leadInstructions(setup),
    tools: leadTools(setup),
  }
}

function approvalIds(message: ModelMessage) {
  return message.role === 'tool'
    ? message.content.flatMap((part) =>
        part.type === 'tool-approval-response' ? [part.approvalId] : [],
      )
    : []
}

/**
 * Keeps only the approval parts of the decision being answered now. Works
 * around @convex-dev/agent 0.7.7, which rejects a continuation ("Continuation
 * context cannot add approval decisions") when the thread already holds an
 * older approval. Settled tool calls and results stay, so the model still sees
 * what happened. An older call that never got a result is dropped too, since
 * providers reject a call without one. Remove once the component scopes that
 * check to the current request.
 */
const keepCurrentApprovals: ContextHandler = async (
  _ctx,
  { allMessages, inputPrompt },
) => {
  const current = new Set(inputPrompt.flatMap(approvalIds))
  if (current.size === 0) return allMessages
  const answered = new Set(
    allMessages.flatMap((message) =>
      message.role === 'tool'
        ? message.content.flatMap((part) =>
            part.type === 'tool-result' ? [part.toolCallId] : [],
          )
        : [],
    ),
  )
  const unanswered = new Set(
    allMessages.flatMap((message) =>
      message.role === 'assistant' && Array.isArray(message.content)
        ? message.content.flatMap((part) =>
            part.type === 'tool-approval-request' &&
            !current.has(part.approvalId) &&
            !answered.has(part.toolCallId)
              ? [part.toolCallId]
              : [],
          )
        : [],
    ),
  )
  const isOld = (part: {
    type: string
    approvalId?: string
    toolCallId?: string
  }) =>
    ((part.type === 'tool-approval-request' ||
      part.type === 'tool-approval-response') &&
      !current.has(part.approvalId ?? '')) ||
    (part.type === 'tool-call' && unanswered.has(part.toolCallId ?? ''))
  return allMessages.flatMap((message): ModelMessage[] => {
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      const content = message.content.filter((part) => !isOld(part))
      return content.length ? [{ ...message, content }] : []
    }
    if (message.role === 'tool') {
      const content = message.content.filter((part) => !isOld(part))
      return content.length ? [{ ...message, content }] : []
    }
    return [message]
  })
}

function guidelines(project: Project) {
  return project.guidelines
    ? `\nProject guidelines, which always apply:\n${project.guidelines}`
    : ''
}

function leadInstructions({ project, team, emails }: LeadSetup) {
  const delegation = team.length
    ? `Your team:
${team.map((e) => `- ${e.name}: ${e.role}`).join('\n')}

For anything beyond small talk, consult the relevant employees with ask_employee. Ask several in parallel when the topic spans their areas. Then combine what they said into one clear answer, crediting people by name and resolving disagreements yourself.`
    : 'You have no employees yet. Answer yourself, and suggest the user adds people on the Team page.'
  const email = emails.length
    ? `\nYou can send email with send_email from ${emails.map((c) => c.from).join(', ')}. The user approves each email before it goes out, so write the final version, and only say it was sent once the tool result confirms it.`
    : ''
  return `You are ${project.name}, who leads this project. The user is your partner.
${project.brief ? `About the project: ${project.brief}\n` : ''}${delegation}${email}
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

function leadTools({ project, team, emails }: LeadSetup): ToolSet {
  const tools: ToolSet = {
    save_artifact: createTool({
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
    }),
  }

  const [firstEmployee, ...otherEmployees] = team
  if (firstEmployee) {
    tools.ask_employee = createTool({
      description:
        'Ask one employee a question or hand them a task, and get their reply. Call it several times in the same step to consult multiple employees in parallel.',
      inputSchema: z.object({
        employee: z.enum([
          firstEmployee.name,
          ...otherEmployees.map((e) => e.name),
        ]),
        question: z
          .string()
          .describe(
            'What you need from them, with all the context they need. They cannot see the chat.',
          ),
      }),
      execute: async (ctx, { employee, question }, { abortSignal }) => {
        const e =
          team.find((member) => member.name === employee) ?? firstEmployee
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
  }

  const [firstEmail, ...otherEmails] = emails
  if (firstEmail) {
    tools.send_email = createTool({
      description:
        'Send an email. The user reviews and approves it before it goes out.',
      inputSchema: z.object({
        from: z
          .enum([firstEmail.from, ...otherEmails.map((c) => c.from)])
          .describe("Which of the user's addresses to send from."),
        to: z.string().email(),
        subject: z.string().max(200),
        body: z.string().describe('The plain-text body, ready to send.'),
      }),
      needsApproval: true,
      execute: async (ctx, { from, to, subject, body }) => {
        const connection = emails.find((c) => c.from === from) ?? firstEmail
        try {
          await ctx.runAction(internal.emailConnections.send, {
            connectionId: connection._id,
            to,
            subject,
            text: body,
          })
          return { sent: true as const, from, to, subject }
        } catch (error) {
          return {
            sent: false as const,
            to,
            subject,
            error:
              error instanceof ConvexError
                ? String(error.data)
                : 'The email provider refused the message.',
          }
        }
      },
    })
  }

  return tools
}
