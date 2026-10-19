import { createTool } from '@convex-dev/agent'
import { generateText } from 'ai'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import { researchModel, searchModel } from '../../lib/ai'
import { gatewayCost } from '../usage/functions'
import type { Doc } from '../../_generated/dataModel'
import type { ToolCtx } from '@convex-dev/agent'
import type { LanguageModelUsage, ProviderMetadata } from 'ai'

const vSteps = z
  .array(z.string().min(1))
  .min(1)
  .max(30)
  .describe('Each step as a short instruction, in order.')

/** Tools every assistant (`from`) gets: the web, plans saved to the Library, and reminders. */
export function assistantTools(project: Doc<'projects'>, from: string) {
  const record = async (
    ctx: ToolCtx,
    kind: 'search' | 'research',
    label: string,
    {
      usage,
      providerMetadata,
    }: { usage: LanguageModelUsage; providerMetadata?: ProviderMetadata },
  ) => {
    if (!ctx.threadId) return
    await ctx.runMutation(internal.api.usage.record, {
      projectId: project._id,
      threadId: ctx.threadId,
      kind,
      label,
      aiCost: gatewayCost(providerMetadata),
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    })
  }
  return {
    web_search: createTool({
      description:
        'Search the web for current facts, news, prices or anything after your training. Returns a short sourced answer.',
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: async (ctx, { query }, { abortSignal }) => {
        const result = await generateText({
          model: searchModel,
          prompt: query,
          abortSignal,
        })
        await record(ctx, 'search', query, result)
        return { answer: result.text }
      },
    }),
    research: createTool({
      description:
        'Research a question in depth across many web sources. Slower and costlier than web_search, so use it when the user asks for research or a comparison.',
      inputSchema: z.object({ question: z.string().min(1) }),
      execute: async (ctx, { question }, { abortSignal }) => {
        const result = await generateText({
          model: researchModel,
          system:
            'Write a thorough, well-organized research brief in markdown: key findings first, then details, then open questions.',
          prompt: question,
          abortSignal,
        })
        await record(ctx, 'research', question, result)
        return { report: result.text }
      },
    }),
    save_plan: createTool({
      description:
        'Save a plan as a checklist in the Library, or replace an existing plan by passing its planId. Use it whenever the user asks for a plan.',
      inputSchema: z.object({
        title: z.string().min(1).max(80),
        steps: vSteps,
        planId: z.string().optional().describe('To revise a saved plan.'),
      }),
      execute: async (ctx, { title, steps, planId }) => {
        const id: string = await ctx.runMutation(internal.api.plans.write, {
          projectId: project._id,
          threadId: ctx.threadId ?? '',
          planId,
          title,
          steps: steps.map((text) => ({ text, done: false })),
        })
        return { planId: id, saved: true }
      },
    }),
    set_reminder: createTool({
      description:
        'Remind the user about something later. It posts in this chat when due, and also texts them or rings them in the app if they ask for that.',
      inputSchema: z.object({
        message: z
          .string()
          .min(1)
          .max(500)
          .describe('What to remind them of, written to them.'),
        at: z
          .string()
          .describe(
            "When, as ISO 8601 with the UTC offset of the user's time zone, like 2026-10-20T17:00:00+03:00.",
          ),
        via: z
          .enum(['chat', 'text', 'call'])
          .describe(
            'chat unless they asked to be texted (text) or called (call).',
          ),
      }),
      execute: async (ctx, { message, at, via }) => {
        const dueAt = Date.parse(at)
        if (Number.isNaN(dueAt))
          throw new Error(`Couldn't read the time "${at}".`)
        if (!ctx.threadId) throw new Error('Reminders need a chat.')
        await ctx.runMutation(internal.api.reminders.schedule, {
          projectId: project._id,
          threadId: ctx.threadId,
          from,
          message,
          dueAt,
          via,
        })
        return { scheduled: true, at: new Date(dueAt).toISOString(), via }
      },
    }),
  }
}
