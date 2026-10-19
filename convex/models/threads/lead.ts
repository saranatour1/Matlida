import { Agent, createTool, stepCountIs } from '@convex-dev/agent'
import { z } from 'zod'
import { components, internal } from '../../_generated/api'
import { languageModel } from '../../lib/ai'
import type { Doc } from '../../_generated/dataModel'
import type { ToolSet } from 'ai'

type Project = Doc<'projects'>
type Bot = Doc<'bots'>

function guidelines(project: Project) {
  return project.guidelines
    ? `\nProject guidelines, which always apply:\n${project.guidelines}`
    : ''
}

function leadInstructions(project: Project, bots: Array<Bot>) {
  const team = bots.length
    ? `Your bots:
${bots.map((b) => `- ${b.name}: ${b.role}`).join('\n')}

For anything beyond small talk, hand the work to the relevant bots with ask_bot. Ask several in parallel when the topic spans their areas. Then combine what they said into one clear answer, crediting them by name.`
    : 'You have no bots yet. Answer yourself, and suggest the user adds some on the Bots page.'
  return `You are ${project.name}, who leads this project. The user is your partner.
${project.brief ? `About the project: ${project.brief}\n` : ''}${team}
Keep replies concise and use markdown.${guidelines(project)}`
}

function botInstructions(project: Project, bot: Bot) {
  return `You are ${bot.name}, ${bot.role}, working for ${project.name}.
${bot.instructions}${guidelines(project)}`
}

/** The tools the lead gets. `ask_bot` exists only when the project has bots. */
function leadTools(project: Project, bots: Array<Bot>): ToolSet {
  if (bots.length === 0) return {}
  const [first, ...rest] = bots
  return {
    ask_bot: createTool({
      description:
        'Hand one of your bots a task or question and get its reply. Call it several times in the same step to ask several bots in parallel.',
      inputSchema: z.object({
        bot: z.enum([first.name, ...rest.map((b) => b.name)]),
        task: z
          .string()
          .describe(
            'What you need from the bot, with all the context it needs. It cannot see the chat.',
          ),
      }),
      execute: async (ctx, { bot, task }, { abortSignal }) => {
        const b = bots.find((candidate) => candidate.name === bot) ?? first
        const threadId: string = await ctx.runMutation(
          internal.api.threads.start,
          {
            projectId: project._id,
            kind: 'subagent',
            title: `${project.name} → ${b.name}`,
            parentThreadId: ctx.threadId,
            userId: project.ownerId,
          },
        )
        const agent = new Agent(components.agent, {
          name: b.name,
          languageModel,
          instructions: botInstructions(project, b),
        })
        const { text } = await agent.generateText(
          ctx,
          { threadId },
          { prompt: task, abortSignal },
        )
        return { name: b.name, role: b.role, reply: text, threadId }
      },
    }),
  }
}

/** The project's lead for one reply, with the project's current bots. */
export function createLead(project: Project, bots: Array<Bot>) {
  return {
    agent: new Agent(components.agent, {
      name: project.name,
      languageModel,
      instructions: leadInstructions(project, bots),
      stopWhen: stepCountIs(6),
    }),
    tools: leadTools(project, bots),
  }
}
