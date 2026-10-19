import { createTool } from '@convex-dev/agent'
import { generateText } from 'ai'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import { researchModel, searchModel } from '../../lib/ai'
import type { Doc } from '../../_generated/dataModel'

const vSteps = z
  .array(z.string().min(1))
  .min(1)
  .max(30)
  .describe('Each step as a short instruction, in order.')

/** Tools every assistant gets: the web, and plans saved to the Library. */
export function assistantTools(project: Doc<'projects'>) {
  return {
    web_search: createTool({
      description:
        'Search the web for current facts, news, prices or anything after your training. Returns a short sourced answer.',
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: async (_ctx, { query }, { abortSignal }) => {
        const { text } = await generateText({
          model: searchModel,
          prompt: query,
          abortSignal,
        })
        return { answer: text }
      },
    }),
    research: createTool({
      description:
        'Research a question in depth across many web sources. Slower and costlier than web_search, so use it when the user asks for research or a comparison.',
      inputSchema: z.object({ question: z.string().min(1) }),
      execute: async (_ctx, { question }, { abortSignal }) => {
        const { text } = await generateText({
          model: researchModel,
          system:
            'Write a thorough, well-organized research brief in markdown: key findings first, then details, then open questions.',
          prompt: question,
          abortSignal,
        })
        return { report: text }
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
  }
}
