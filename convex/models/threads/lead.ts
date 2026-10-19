import { Agent, createTool, stepCountIs } from '@convex-dev/agent'
import { v } from 'convex/values'
import { z } from 'zod'
import { components, internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
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

/** A command the user ran with `/name`, and its markdown from storage. */
export type RunCommand = { name: string; markdown: string }

/** How this reply differs from a normal chat reply. */
export type ReplyOptions = {
  command?: RunCommand
  /** The reply goes out as a text message. */
  viaText?: boolean
}

function leadInstructions(
  project: Project,
  bots: Array<Bot>,
  { command, viaText }: ReplyOptions,
) {
  const team = bots.length
    ? `Your bots:
${bots.map((b) => `- ${b.name}: ${b.role}`).join('\n')}

For anything beyond small talk, hand the work to the relevant bots with ask_bot. Ask several in parallel when the topic spans their areas. Then combine what they said into one clear answer, crediting them by name.`
    : 'You have no bots yet. Answer yourself, and suggest the user adds some on the Bots page.'
  return `You are ${project.name}, who leads this project. The user is your partner.
${project.brief ? `About the project: ${project.brief}\n` : ''}${team}
${
  viaText
    ? 'You are replying by text message: plain text with no markdown, a few sentences at most.'
    : 'Keep replies concise and use markdown.'
}${guidelines(project)}${
    command
      ? `\n\nThe user ran the /${command.name} command. Follow it for this reply:\n${command.markdown}`
      : ''
  }`
}

function botInstructions(project: Project, bot: Bot) {
  return `You are ${bot.name}, ${bot.role}, working for ${project.name}.
${bot.instructions}${guidelines(project)}`
}

const BOT_CALLS_PER_REPLY = 6

/** The tools the lead gets. `ask_bot` exists only when the project has bots. */
function leadTools(project: Project, bots: Array<Bot>): ToolSet {
  if (bots.length === 0) return {}
  const [first, ...rest] = bots
  let botCalls = 0
  return {
    ask_bot: createTool({
      description: `Hand one of your bots a task or question and get its reply. Call it several times in the same step to ask several bots in parallel. You can call it at most ${BOT_CALLS_PER_REPLY} times per reply.`,
      inputSchema: z.object({
        bot: z.enum([first.name, ...rest.map((b) => b.name)]),
        task: z
          .string()
          .describe(
            'What you need from the bot, with all the context it needs. It cannot see the chat.',
          ),
      }),
      execute: async (ctx, { bot, task }, { abortSignal }) => {
        botCalls++
        if (botCalls > BOT_CALLS_PER_REPLY) {
          throw new Error(
            'Bot budget for this reply is used up; answer with what you have.',
          )
        }
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
export function createLead(
  project: Project,
  bots: Array<Bot>,
  options: ReplyOptions = {},
) {
  return {
    agent: new Agent(components.agent, {
      name: project.name,
      languageModel,
      instructions: leadInstructions(project, bots, options),
      stopWhen: stepCountIs(6),
    }),
    tools: leadTools(project, bots),
  }
}

// Here, not in ./chat, so the chat query and mutation don't load the lead's model and tools.

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
    const lead = createLead(project, bots, {
      command:
        command && markdown ? { name: command.name, markdown } : undefined,
    })
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

export const leadApi = { respond }
