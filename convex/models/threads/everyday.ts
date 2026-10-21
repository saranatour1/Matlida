import { createTool } from '@convex-dev/agent'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import { compareTimes, isTimeZone, splitCosts } from '../../lib/everyday'
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
    get_today: createTool({
      description:
        "What's on the user's plate: reminders in the next 24 hours, messages waiting for their OK, tasks waiting or running, emails from the last three days nobody replied to, and lists with things left. In the app it shows as a card, so keep your reply to what matters most.",
      inputSchema: z.object({}),
      execute: async (ctx) => {
        const today: {
          reminders: Array<{
            message: string
            dueAt: number
            via: string
            to?: string
          }>
          toConfirm: number
          tasks: Array<{ title: string; status: string }>
          emails: Array<{ from: string; subject: string; receivedAt: number }>
          lists: Array<{
            planId: string
            title: string
            left: number
            next: Array<string>
          }>
        } = await ctx.runQuery(internal.api.projects.today, {
          projectId: project._id,
        })
        return { ...today, now: Date.now() }
      },
    }),
    show_timeline: createTool({
      description:
        'Show a schedule as a timeline in the chat: a day in time blocks, or a trip day by day. Group items with `group` (like "Day 1 · Sat 14 Nov"). Keep titles short.',
      inputSchema: z.object({
        title: z.string().min(1).max(80),
        items: z
          .array(
            z.object({
              when: z
                .string()
                .min(1)
                .max(40)
                .describe('Like "9:00–10:30" or "Morning".'),
              title: z.string().min(1).max(120),
              detail: z.string().max(300).optional(),
              group: z.string().max(40).optional(),
            }),
          )
          .min(1)
          .max(40),
        note: z.string().max(300).optional(),
      }),
      execute: (_ctx, timeline) => Promise.resolve(timeline),
    }),
    split_costs: createTool({
      description:
        'Split shared costs: who paid what, each share, and the fewest payments to settle up. It does the math; never add up money yourself. Amounts are in one currency.',
      inputSchema: z
        .object({
          currency: z
            .string()
            .max(8)
            .describe('A symbol or code, like $, € or AED.'),
          people: z.array(z.string().trim().min(1).max(40)).min(2).max(20),
          expenses: z
            .array(
              z.object({
                what: z.string().min(1).max(80),
                amount: z.number().positive().max(1_000_000),
                paidBy: z.string(),
                splitAmong: z
                  .array(z.string())
                  .optional()
                  .describe('Who shares it, when not everyone.'),
              }),
            )
            .min(1)
            .max(50),
        })
        .refine(
          (s) => new Set(s.people).size === s.people.length,
          'Name each person once.',
        )
        .refine(
          (s) =>
            s.expenses.every(
              (e) =>
                s.people.includes(e.paidBy) &&
                (e.splitAmong ?? []).every((p) => s.people.includes(p)),
            ),
          'Everyone who pays or shares has to be in `people`.',
        ),
      execute: (_ctx, { currency, people, expenses }) =>
        Promise.resolve({
          currency,
          expenses,
          ...splitCosts(people, expenses),
        }),
    }),
    compare_times: createTool({
      description:
        "Line up a time across time zones, and find when everyone is in working hours over the next 24 hours. Give each place's IANA zone, like Europe/London. It does the math; don't convert times yourself.",
      inputSchema: z.object({
        zones: z
          .array(
            z.object({
              label: z.string().min(1).max(40),
              timeZone: z
                .string()
                .refine(isTimeZone, 'Use an IANA zone, like Asia/Dubai.'),
            }),
          )
          .min(2)
          .max(8),
        at: z
          .string()
          .optional()
          .describe(
            'The time to check, as ISO 8601 with an offset. Now when unset.',
          ),
      }),
      execute: (_ctx, { zones, at }) => {
        const when = at ? Date.parse(at) : Date.now()
        if (Number.isNaN(when)) {
          throw new Error('Give `at` as ISO 8601, like 2026-11-03T15:00:00Z.')
        }
        return Promise.resolve(compareTimes(zones, when))
      },
    }),
    start_timer: createTool({
      description:
        'Start a focus timer that counts down in the chat, like a 25-minute work session or a 5-minute break.',
      inputSchema: z.object({
        label: z.string().min(1).max(60),
        minutes: z.number().int().min(1).max(180),
      }),
      execute: (_ctx, { label, minutes }) =>
        Promise.resolve({
          label,
          minutes,
          endsAt: Date.now() + minutes * 60_000,
        }),
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
  'show_timeline',
  'start_timer',
  'show_cart',
])
