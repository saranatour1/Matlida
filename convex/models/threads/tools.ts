import { createTool } from '@convex-dev/agent'
import { generateText } from 'ai'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import { decisionModel, researchModel, searchModel } from '../../lib/ai'
import { decide } from '../../lib/decide'
import { fetchNews } from '../../lib/news'
import { gatewayCost } from '../usage/functions'
import { everydayTools } from './everyday'
import { pageTools } from './pages'
import { shoppingTools } from './shopping'
import type { Doc } from '../../_generated/dataModel'
import type { ToolCtx } from '@convex-dev/agent'
import type { LanguageModelUsage, ProviderMetadata } from 'ai'

const vSteps = z
  .array(z.string().min(1))
  .min(1)
  .max(30)
  .describe('Each step as a short instruction, in order.')

/** How long a post can be on each platform, in characters. Previews flag anything over. */
const POST_LIMITS = { linkedin: 3000, x: 280, reddit: 40_000, discord: 2000 }

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
    ...everydayTools(project),
    ...shoppingTools(project),
    ...pageTools(project, from),
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
    get_news: createTool({
      description:
        "The user's news: the most important stories from the last 24 hours on the topics and regions they follow, each with its source. Pass `topics` for a one-off, like a story they name. It returns needsSetup when they haven't chosen what to follow; then call setup_news. In the app the stories show as a card.",
      inputSchema: z.object({
        topics: z.array(z.string().trim().min(1).max(60)).max(6).optional(),
      }),
      execute: async (ctx, { topics }, { abortSignal }) => {
        const settings: Doc<'newsSettings'> | null = await ctx.runQuery(
          internal.api.news.forUser,
          { userId: project.ownerId },
        )
        const follow = topics?.length ? topics : settings?.topics
        if (!follow) {
          return { needsSetup: true, date: Date.now(), sections: [] }
        }
        const sections = await fetchNews(
          searchModel,
          {
            topics: follow,
            regions: settings?.regions ?? [],
            avoid: settings?.avoid,
            perTopic: settings?.perTopic ?? 3,
          },
          abortSignal,
        )
        await Promise.all(
          sections.map((s) => record(ctx, 'search', `News: ${s.topic}`, s)),
        )
        return {
          needsSetup: false,
          date: Date.now(),
          sections: sections.map(({ topic, stories }) => ({ topic, stories })),
        }
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
    run_plan: createTool({
      description:
        'Carry out a saved plan step by step as a task: you do each step with your tools, and the chat shows the steps live. It waits for the user to press Start. Use it when they ask you to run, carry out or work through a plan; save the plan with save_plan first.',
      inputSchema: z.object({
        planId: z.string().describe('From save_plan.'),
      }),
      execute: async (
        ctx,
        { planId },
      ): Promise<{ taskId: string; waitingForStart: boolean }> => {
        if (!ctx.threadId) throw new Error('Tasks need a chat.')
        const taskId: string = await ctx.runMutation(
          internal.api.tasks.startPlan,
          { projectId: project._id, threadId: ctx.threadId, planId },
        )
        return { taskId, waitingForStart: true }
      },
    }),
    show_chart: createTool({
      description:
        "Show numbers as a chart in the chat. Use line for change over time, bar to compare, area for totals over time, pie for parts of a whole (one series, at most 8 slices). Only chart numbers the user gave or that you looked up; say where they're from in `source`.",
      inputSchema: z
        .object({
          title: z.string().min(1).max(80),
          kind: z.enum(['bar', 'line', 'area', 'pie']),
          /** Each series' name, like Revenue. One for pie. */
          series: z.array(z.string().min(1).max(40)).min(1).max(4),
          points: z
            .array(
              z.object({
                label: z.string().min(1).max(40),
                /** One value per series, in the same order. */
                values: z.array(z.number()).min(1).max(4),
              }),
            )
            .min(1)
            .max(50),
          unit: z.string().max(12).optional().describe('Like $, %, or users.'),
          source: z.string().max(200).optional(),
        })
        .refine(
          (c) => c.points.every((p) => p.values.length === c.series.length),
          'Give each point one value per series.',
        )
        .refine(
          (c) => c.kind !== 'pie' || c.series.length === 1,
          'A pie chart has one series.',
        ),
      execute: (_ctx, chart) => Promise.resolve(chart),
    }),
    preview_posts: createTool({
      description:
        "Show drafts of social posts in the chat, laid out the way LinkedIn, X, Reddit or Discord show them, so the user can compare versions before posting. Give two or three versions per platform in one call, each labelled by its angle (like Punchy, Story, Question), within the platform's length. It posts nothing.",
      inputSchema: z.object({
        posts: z
          .array(
            z.object({
              platform: z.enum(['linkedin', 'x', 'reddit', 'discord']),
              label: z
                .string()
                .min(1)
                .max(30)
                .describe('What makes this version different.'),
              text: z.string().min(1).max(4000),
              title: z.string().max(300).optional().describe('Reddit only.'),
              subreddit: z
                .string()
                .max(50)
                .optional()
                .describe('Reddit only, without r/.'),
              channel: z
                .string()
                .max(50)
                .optional()
                .describe('Discord only, without #.'),
            }),
          )
          .min(1)
          .max(12),
      }),
      execute: (_ctx, { posts }) =>
        Promise.resolve({
          author: from,
          posts: posts.map((post) => ({
            ...post,
            limit: POST_LIMITS[post.platform],
          })),
        }),
    }),
    save_command: createTool({
      description:
        'Save a reusable command the user can run as /name, or replace their command with the same name. The markdown is the instructions you follow when it runs, written to you.',
      inputSchema: z.object({
        name: z
          .string()
          .regex(
            /^[a-z0-9][a-z0-9-]{0,31}$/,
            'Use up to 32 lowercase letters, numbers and dashes.',
          ),
        description: z.string().min(1).max(200),
        markdown: z.string().min(1).max(20_000),
      }),
      execute: async (ctx, { markdown, ...command }) => {
        const storageId = await ctx.storage.store(
          new Blob([markdown], { type: 'text/markdown' }),
        )
        const existing: Array<Doc<'commands'>> = await ctx.runQuery(
          internal.api.commands.byName,
          { projectId: project._id, name: command.name },
        )
        try {
          await ctx.runMutation(internal.api.commands.write, {
            projectId: project._id,
            id: existing[0]?._id,
            userId: project.ownerId,
            storageId,
            ...command,
          })
        } catch (error) {
          await ctx.storage.delete(storageId)
          throw error
        }
        return { saved: true, run: `/${command.name}` }
      },
    }),
    save_contact: createTool({
      description:
        'Save someone the user wants you to reach, like a friend or colleague, or add details to a saved contact with the same name. Ask the user for their email before messaging them.',
      inputSchema: z.object({
        name: z.string().trim().min(1).max(80),
        email: z.email().optional(),
        phone: z
          .string()
          .regex(
            /^\+[1-9]\d{6,14}$/,
            'Use international format, like +14155550123.',
          )
          .optional(),
        note: z.string().max(200).optional(),
      }),
      execute: async (ctx, contact) => {
        const id: string = await ctx.runMutation(internal.api.contacts.save, {
          projectId: project._id,
          ...contact,
        })
        return { contactId: id, saved: true }
      },
    }),
    find_contact: createTool({
      description:
        "Look up the user's saved contacts by name, to see if you have someone's email.",
      inputSchema: z.object({ name: z.string().trim().min(1) }),
      execute: async (ctx, { name }) => {
        const found: Array<Doc<'contacts'>> = await ctx.runQuery(
          internal.api.contacts.find,
          { projectId: project._id, name },
        )
        return found.map((c) => ({
          name: c.name,
          email: c.email ?? null,
          phone: c.phone ?? null,
          note: c.note ?? null,
        }))
      },
    }),
    find_emails: createTool({
      description:
        "Search the user's earlier emails, theirs and other people's, by words in the subject or text, optionally only from one address. Use it for context when answering or drafting a reply.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe('Words to look for.'),
        from: z.email().optional().describe('Only emails from this address.'),
      }),
      execute: async (ctx, { query, from: sender }) => {
        const found: Array<{
          from: string
          subject: string
          receivedAt: number
          text: string
          replied: boolean
        }> = await ctx.runQuery(internal.api.emails.search, {
          userId: project.ownerId,
          query,
          from: sender,
        })
        return found.map((e) => ({
          ...e,
          receivedAt: new Date(e.receivedAt).toISOString(),
        }))
      },
    }),
    decide: createTool({
      description:
        "Pick between options with Jev, TypeSafe's judgment model, when the user asks you to decide or choose. Give every option and the facts that matter. It returns the pick and each option's probability: when the pick is under 0.5, say it's close and name the runner-up.",
      inputSchema: z.object({
        question: z.string().trim().min(1).describe('What to decide.'),
        options: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(80),
              description: z
                .string()
                .max(500)
                .optional()
                .describe('What the option is, if the name is not enough.'),
            }),
          )
          .min(2)
          .max(20)
          .refine(
            (options) =>
              new Set(options.map((o) => o.name)).size === options.length,
            'Each option needs its own name.',
          ),
        context: z
          .string()
          .max(4000)
          .describe(
            "What matters for the choice: the user's goals, limits and preferences from the chat.",
          ),
      }),
      execute: async (_ctx, input, { abortSignal }) =>
        await decide(decisionModel, input, abortSignal),
    }),
    find_texts: createTool({
      description:
        'Search what the user has texted you on Telegram, by words in the message.',
      inputSchema: z.object({
        query: z.string().trim().min(1).describe('Words to look for.'),
      }),
      execute: async (ctx, { query }) => {
        const found: Array<{ platform: string; text: string; sentAt: number }> =
          await ctx.runQuery(internal.api.texts.search, {
            userId: project.ownerId,
            query,
          })
        return found.map((t) => ({
          text: t.text,
          sentAt: new Date(t.sentAt).toISOString(),
        }))
      },
    }),
    set_reminder: createTool({
      description:
        'Remind the user about something later. It posts in this chat when due, and also texts them, emails them or rings them in the app if they ask for that. To pass a message to someone else at a time ("tell Luke tomorrow to check his car insurance"), set `to` to their saved contact name and `say` to the message, written to them; it goes by email, and only after the user confirms it in the chat. Calling other people isn\'t available yet: offer email instead.',
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
          .enum(['chat', 'text', 'call', 'email'])
          .describe(
            'chat unless they asked to be texted (text), emailed (email) or called (call). email when `to` is set.',
          ),
        to: z
          .string()
          .optional()
          .describe(
            "A saved contact's name, to message them instead of the user.",
          ),
        say: z
          .string()
          .max(1000)
          .optional()
          .describe(
            "With `to`: the message, written to them in the second person, saying who it's from. Like: Hi Luke, Sara asked me to remind you to check on your car insurance.",
          ),
      }),
      execute: async (ctx, { message, at, via, to, say }) => {
        const dueAt = Date.parse(at)
        if (Number.isNaN(dueAt))
          throw new Error(`Couldn't read the time "${at}".`)
        if (!ctx.threadId) throw new Error('Reminders need a chat.')
        let contact: Doc<'contacts'> | undefined
        if (to) {
          const found: Array<Doc<'contacts'>> = await ctx.runQuery(
            internal.api.contacts.find,
            { projectId: project._id, name: to },
          )
          contact =
            found.find((c) => c.name.toLowerCase() === to.toLowerCase()) ??
            (found.length === 1 ? found[0] : undefined)
          if (!contact) {
            throw new Error(
              found.length
                ? `Several contacts match "${to}": ${found.map((c) => c.name).join(', ')}. Ask which one.`
                : `There's no contact named "${to}". Ask the user for their email and save them with save_contact first.`,
            )
          }
          if (via !== 'email') {
            throw new Error(
              `Calling or texting other people isn't available yet. Offer to email ${contact.name} instead.`,
            )
          }
          if (!contact.email) {
            throw new Error(
              `There's no email for ${contact.name}. Ask the user for it and save it with save_contact.`,
            )
          }
          if (!say) throw new Error('Write the message to them in `say`.')
        }
        const reminderId: string = await ctx.runMutation(
          internal.api.reminders.schedule,
          {
            projectId: project._id,
            threadId: ctx.threadId,
            from,
            message,
            dueAt,
            via,
            contactId: contact?._id,
            toName: contact?.name,
            say: contact ? say : undefined,
          },
        )
        return {
          scheduled: !contact,
          /** True when it waits for the user's OK in the chat. */
          pending: Boolean(contact),
          reminderId,
          to: contact?.name ?? null,
          at: new Date(dueAt).toISOString(),
          via,
        }
      },
    }),
  }
}
