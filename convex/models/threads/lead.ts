import { Agent, createTool, stepCountIs } from '@convex-dev/agent'
import { z } from 'zod'
import { gatewayCost } from '../usage/functions'
import { components, internal } from '../../_generated/api'
import { chatModel, languageModel } from '../../lib/ai'
import { MODELS } from '../../lib/models'
import { assistantTools } from './tools'
import type { Doc } from '../../_generated/dataModel'
import type { UsageHandler } from '@convex-dev/agent'
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

/** Where the reply goes, which decides how it's written. */
export type Via = 'chat' | 'text' | 'email' | 'voice'

const STYLE: Record<Via, string> = {
  chat: 'Keep replies concise and use markdown.',
  text: 'You are replying by text message: plain text with no markdown, a few sentences at most.',
  email:
    'You are replying by email: plain text with no markdown, short paragraphs, no subject line and no signature.',
  voice:
    'You are talking out loud on a call: plain spoken sentences with no markdown, lists, links or emoji, two or three sentences unless the user asks for more.',
}

/** How this reply differs from a normal chat reply. */
export type ReplyOptions = {
  command?: RunCommand
  via?: Via
  /** The chat's model, chosen in the chat. It wins over the assistant's own. */
  model?: string
  /** The user's IANA time zone, so "at 5 tomorrow" means their 5. UTC when unknown. */
  timeZone?: string
  /** On a call: the user talked over the last reply. */
  cutOff?: boolean
}

/** How to write the reply, and whether the user missed the end of the last one. */
function style(via: Via, cutOff?: boolean) {
  return cutOff
    ? `${STYLE[via]} The user just talked over your last reply, so they may not have heard the end of it. Answer what they said now, and don't repeat yourself unless they ask.`
    : STYLE[via]
}

/** The current time in the user's zone, for reminders and anything date-relative. */
function now(timeZone = 'UTC') {
  const local = new Date().toLocaleString('en-US', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  })
  return `\nIt is now ${local} (${timeZone}).`
}

function leadInstructions(
  project: Project,
  bots: Array<Bot>,
  { command, via = 'chat', timeZone, cutOff }: ReplyOptions,
) {
  const team = bots.length
    ? `Your bots:
${bots.map((b) => `- ${b.name}: ${b.role}`).join('\n')}

For anything beyond small talk, hand the work to the relevant bots with ask_bot. Ask several in parallel when the topic spans their areas. Then combine what they said into one clear answer, crediting them by name.`
    : 'You have no bots yet. Answer yourself, and suggest the user adds some on the Bots page.'
  return `You are ${project.name}, who leads this project. The user is your partner.
${project.brief ? `About the project: ${project.brief}\n` : ''}${team}
${style(via, cutOff)}${now(timeZone)}${guidelines(project)}${
    command
      ? `\n\nThe user ran the /${command.name} command. Follow it for this reply:\n${command.markdown}`
      : ''
  }`
}

function botInstructions(
  project: Project,
  bot: Bot,
  members: Array<Bot>,
  { via = 'chat', timeZone, cutOff }: ReplyOptions = {},
) {
  const team = members.length
    ? `\nTeammates in this chat, who you can ask with ask_bot:\n${members.map((m) => `- ${m.name}: ${m.role}`).join('\n')}`
    : ''
  return `You are ${bot.name}, ${bot.role}, working for ${project.name}.
${bot.instructions}${team}
${style(via, cutOff)}${now(timeZone)}${guidelines(project)}`
}

const BOT_CALLS_PER_REPLY = 6

/** The gateway model for `id`, or the default when it's unset or the default itself. */
function modelFor(id: string | undefined) {
  return !id || id === MODELS.chat ? languageModel : chatModel(id)
}

/** Records each model step's tokens and cost, charged to `chargeTo` or the agent's own thread. */
function recordUsage(
  project: Project,
  model: string,
  chargeTo?: string,
): UsageHandler {
  return async (ctx, { threadId, agentName, usage, providerMetadata }) => {
    const thread = chargeTo ?? threadId
    if (!thread) return
    await ctx.runMutation(internal.api.usage.record, {
      projectId: project._id,
      threadId: thread,
      kind: 'reply',
      label: agentName ?? 'Assistant',
      model,
      aiCost: gatewayCost(providerMetadata),
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    })
  }
}

/** `ask_bot` over the chat's members, for whoever is answering. None without members. */
function askTools(project: Project, bots: Array<Bot>, from: string): ToolSet {
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
            title: `${from} → ${b.name}`,
            parentThreadId: ctx.threadId,
            botId: b._id,
            userId: project.ownerId,
          },
        )
        const model = b.model ?? MODELS.chat
        const agent = new Agent(components.agent, {
          name: b.name,
          languageModel: modelFor(model),
          instructions: botInstructions(project, b, []),
          usageHandler: recordUsage(project, model, ctx.threadId),
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

/** A bot answering the user directly in its own chat, with the chat's members. */
export function createBot(
  project: Project,
  bot: Bot,
  members: Array<Bot>,
  options: ReplyOptions = {},
) {
  const model = options.model ?? bot.model ?? MODELS.chat
  return {
    agent: new Agent(components.agent, {
      name: bot.name,
      languageModel: modelFor(model),
      instructions: botInstructions(project, bot, members, options),
      stopWhen: stepCountIs(6),
      usageHandler: recordUsage(project, model),
    }),
    tools: {
      ...assistantTools(project, bot.name),
      ...askTools(project, members, bot.name),
    },
  }
}

/** The project's lead for one reply, with the chat's members. */
export function createLead(
  project: Project,
  bots: Array<Bot>,
  options: ReplyOptions = {},
) {
  const model = options.model ?? project.model ?? MODELS.chat
  return {
    agent: new Agent(components.agent, {
      name: project.name,
      languageModel: modelFor(model),
      instructions: leadInstructions(project, bots, options),
      stopWhen: stepCountIs(6),
      usageHandler: recordUsage(project, model),
    }),
    tools: {
      ...assistantTools(project, project.name),
      ...askTools(project, bots, project.name),
    },
  }
}
