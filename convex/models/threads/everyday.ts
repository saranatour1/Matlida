import { createTool } from '@convex-dev/agent'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'

/**
 * Tools for everyday commands. Most only show a card in the chat (`show_*`):
 * their output is their input, and the card does the rest. The rest keep
 * lists the user ticks off.
 */
export function everydayTools(project: Doc<'projects'>) {
  return {
    add_to_list: createTool({
      description:
        'Add items to one of the user\'s lists, like "To-do" or "Shopping list", or start a new list (like "Packing: Lisbon"). The chat shows the list to tick off. Pass no items to just show it.',
      inputSchema: z.object({
        list: z.string().trim().min(1).max(60),
        items: z
          .array(
            z.object({
              text: z.string().trim().min(1).max(200),
              section: z
                .string()
                .max(40)
                .optional()
                .describe('A heading to group under, like an aisle.'),
            }),
          )
          .max(60),
      }),
      execute: async (ctx, { list, items }) => {
        const id: string = await ctx.runMutation(internal.api.plans.addItems, {
          projectId: project._id,
          threadId: ctx.threadId ?? '',
          title: list,
          items,
        })
        return { planId: id, added: items.length }
      },
    }),
    show_drafts: createTool({
      description:
        'Show text the user will send or paste somewhere (a reply, a rewrite, a translation) as cards with a Copy button, one per version. Give 1 to 4 versions, each labelled by what makes it different. Do not repeat the drafts in your reply.',
      inputSchema: z.object({
        title: z
          .string()
          .min(1)
          .max(80)
          .describe('What these are, like "Reply to Sam" or "In Spanish".'),
        to: z.string().max(120).optional().describe('Who it goes to.'),
        drafts: z
          .array(
            z.object({
              label: z.string().min(1).max(40),
              text: z.string().min(1).max(5000),
            }),
          )
          .min(1)
          .max(4),
      }),
      execute: (_ctx, drafts) => Promise.resolve(drafts),
    }),
    show_table: createTool({
      description:
        'Show a table in the chat: options side by side, a weekly plan, anything with rows and columns. Keep cells short. Only state facts the user gave or you looked up.',
      inputSchema: z
        .object({
          title: z.string().min(1).max(80),
          columns: z.array(z.string().min(1).max(40)).min(2).max(6),
          rows: z
            .array(z.array(z.string().max(200)))
            .min(1)
            .max(20),
          highlight: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe('The row to highlight, like the best pick, from 0.'),
          note: z.string().max(300).optional().describe('Sources or caveats.'),
        })
        .refine(
          (t) => t.rows.every((row) => row.length === t.columns.length),
          'Give each row one cell per column.',
        )
        .refine(
          (t) => t.highlight === undefined || t.highlight < t.rows.length,
          'Highlight a row that exists.',
        ),
      execute: (_ctx, table) => Promise.resolve(table),
    }),
    show_recipe: createTool({
      description:
        'Show a recipe as a card the user can scale to more or fewer servings and add to their Shopping list. Give amounts as numbers for the servings stated.',
      inputSchema: z.object({
        title: z.string().min(1).max(80),
        servings: z.number().int().min(1).max(24),
        minutes: z.number().int().min(1).max(1440).optional(),
        ingredients: z
          .array(
            z.object({
              item: z.string().min(1).max(80),
              amount: z.number().positive().optional(),
              unit: z.string().max(20).optional(),
            }),
          )
          .min(1)
          .max(40),
        steps: z.array(z.string().min(1).max(500)).min(1).max(25),
        source: z.string().max(200).optional(),
      }),
      execute: (ctx, recipe) =>
        Promise.resolve({ ...recipe, threadId: ctx.threadId ?? '' }),
    }),
  }
}

/** Tools that only show a card, which texts, calls and emails can't show. */
export const CARD_TOOLS = new Set([
  'show_chart',
  'preview_post',
  'show_drafts',
  'show_table',
  'show_recipe',
])
