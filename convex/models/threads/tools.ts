import { createTool } from '@convex-dev/agent'
import { generateImage, generateText } from 'ai'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import { decisionModel, imageModel } from '../../lib/ai'
import { budgetedModel, metered } from '../../lib/budget'
import { searchConvexDocs } from '../../lib/convexDocs'
import {
  decide,
  howOften,
  needsFollowUp,
  recentTurns,
  whoShouldHandle,
} from '../../lib/decide'
import { MODELS } from '../../lib/models'
import { fetchNews } from '../../lib/news'
import { FLAGS, flagOn } from '../../lib/flags'
import { rateLimiter } from '../../lib/limits'
import { PHONE_NUMBER, maskNumber, typedBy } from '../../lib/phone'
import { saveCommand } from '../commands/functions'
import { gatewayCost } from '../usage/functions'
import { iso, parseIso } from '../../lib/time'
import { everydayTools } from './everyday'
import { pageTools } from './pages'
import { shoppingTools } from './shopping'
import { studyTools } from './study'
import type { ToolCtx } from '@convex-dev/agent'
import type { LanguageModelUsage, ProviderMetadata } from 'ai'
import type { Doc } from '../../lib/ctx'

const vSteps = z
  .array(z.string().min(1))
  .min(1)
  .max(30)
  .describe('Each step as a short instruction, in order.')

/** The sizes GPT Image makes, by shape. */
const IMAGE_SIZES = {
  square: '1024x1024',
  wide: '1536x1024',
  tall: '1024x1536',
} as const

/** How long a post can be on each platform, in characters. Previews flag anything over. */
const POST_LIMITS = { linkedin: 3000, x: 280, reddit: 40_000, discord: 2000 }

/** Tools every assistant (`from`) gets: the web, plans saved to the Library, and reminders. */
export const assistantTools = (project: Doc<'projects'>, from: string) => {
  /** One Jev call under the owner's budget, without its cost in the tool's answer. */
  const judged = <T extends { cost: number }>(
    ctx: ToolCtx,
    ask: () => Promise<T>,
  ): Promise<Omit<T, 'cost'>> =>
    metered(
      ctx,
      { userId: project.ownerId, model: MODELS.decide, estimate: 0.005 },
      async () => {
        const { cost, ...result } = await ask()
        return { result, cost }
      },
    )
  /** Jev's read on whether the reminder the user just asked for repeats. Once when Jev can't say. */
  const repeatOf = async (
    ctx: ToolCtx,
    reminder: string,
    abortSignal?: AbortSignal,
  ) => {
    try {
      const turns = ctx.threadId ? await recentTurns(ctx, ctx.threadId) : []
      const request =
        turns.filter((t) => t.role === 'user').at(-1)?.text ?? reminder
      const { repeat } = await judged(ctx, () =>
        howOften(decisionModel, { request, reminder }, abortSignal),
      )
      return repeat
    } catch (error) {
      console.error(error)
      return 'once'
    }
  }
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
    ...studyTools(project),
    ...pageTools(project, from),
    web_search: createTool({
      description:
        'Search the web for current facts, news, prices or anything after your training. Returns a short sourced answer.',
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: async (ctx, { query }, { abortSignal }) => {
        const result = await generateText({
          model: budgetedModel(ctx, project.ownerId, MODELS.search),
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
          budgetedModel(ctx, project.ownerId, MODELS.search),
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
    quick_summary: createTool({
      description:
        'Summarize text quickly and cheaply with a fast model: a pasted article, an email thread, what web_search found. Returns a bold one-line TL;DR, key points, and any dates, numbers or action items.',
      inputSchema: z.object({
        text: z.string().min(1).max(100_000),
        focus: z
          .string()
          .max(200)
          .optional()
          .describe('What the user cares about, if they said.'),
      }),
      execute: async (ctx, { text, focus }, { abortSignal }) => {
        const result = await generateText({
          model: budgetedModel(ctx, project.ownerId, MODELS.summary),
          system:
            'Summarize for a busy reader: a one-line TL;DR in bold, then at most five short key points, then any dates, numbers or action items. Markdown. No preamble. Only what the text says.',
          prompt: focus ? `Focus on: ${focus}\n\n${text}` : text,
          abortSignal,
        })
        await record(ctx, 'search', 'Quick summary', result)
        return { summary: result.text }
      },
    }),
    generate_image: createTool({
      description:
        'Make a picture from a description. It is saved in the workspace and shows in the chat. Write a detailed prompt: subject, style, setting, light and mood.',
      inputSchema: z.object({
        prompt: z.string().min(1).max(4000),
        shape: z.enum(['square', 'wide', 'tall']).default('square'),
      }),
      execute: async (ctx, { prompt, shape }, { abortSignal }) => {
        const { image, usage, providerMetadata } = await metered(
          ctx,
          { userId: project.ownerId, model: MODELS.image, estimate: 0.08 },
          async () => {
            const made = await generateImage({
              model: imageModel,
              prompt,
              size: IMAGE_SIZES[shape],
              abortSignal,
            })
            // ponytail: the gateway sends no cost for pictures yet, so each counts as 8 cents.
            return {
              result: made,
              cost: gatewayCost(made.providerMetadata) || 0.08,
            }
          },
        )
        const storageId = await ctx.storage.store(
          new Blob([new Uint8Array(image.uint8Array)], {
            type: image.mediaType,
          }),
        )
        if (ctx.threadId) {
          await ctx.runMutation(internal.api.usage.record, {
            projectId: project._id,
            threadId: ctx.threadId,
            kind: 'media',
            label: 'Picture',
            model: MODELS.image,
            aiCost: gatewayCost(providerMetadata),
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
          })
        }
        return { url: await ctx.storage.getUrl(storageId), storageId, prompt }
      },
    }),
    generate_video: createTool({
      description:
        'Make an 8-second video from a description. It takes a few minutes in the background and shows in the chat when ready, so say so and carry on. Write a detailed prompt: subject, action, camera movement, setting, light and mood.',
      inputSchema: z.object({
        prompt: z.string().min(1).max(4000),
        shape: z.enum(['wide', 'tall']).default('wide'),
      }),
      execute: async (ctx, video) => {
        if (!ctx.threadId) throw new Error('Videos need a chat.')
        const videoId: string = await ctx.runMutation(
          internal.api.videos.start,
          { projectId: project._id, threadId: ctx.threadId, ...video },
        )
        return { videoId, prompt: video.prompt }
      },
    }),
    research: createTool({
      description:
        'Research a question in depth across many web sources. Slower and costlier than web_search, so use it when the user asks for research or a comparison.',
      inputSchema: z.object({ question: z.string().min(1) }),
      execute: async (ctx, { question }, { abortSignal }) => {
        const result = await generateText({
          model: budgetedModel(ctx, project.ownerId, MODELS.research),
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
    // Older chats show this name, and the model copies them; without it the call fails.
    preview_post: createTool({
      description:
        'The older name for preview_posts: shows one post. Use preview_posts instead.',
      inputSchema: z.object({
        platform: z.enum(['linkedin', 'x', 'reddit', 'discord']),
        text: z.string().min(1).max(4000),
        title: z.string().max(300).optional(),
        subreddit: z.string().max(50).optional(),
      }),
      execute: (_ctx, post) =>
        Promise.resolve({
          ...post,
          author: from,
          limit: POST_LIMITS[post.platform],
        }),
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
    show_commands: createTool({
      description:
        'Show the commands the user can run, as buttons they can tap. Use it when they ask what you can do, what commands there are, or how to get started.',
      inputSchema: z.object({}),
      execute: async (ctx) => ({
        commands: await ctx.runQuery(internal.api.commands.described, {
          projectId: project._id,
        }),
      }),
    }),
    save_command: createTool({
      description:
        "Save a new reusable command the user can run as /name. The markdown is the instructions you follow when it runs, written to you. It can't change an existing command: the user edits those in the Library.",
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
      execute: async (ctx, command) => {
        // Adds it, or changes nothing when the same is already saved. Never
        // replaces a command the user has: that would let a planted
        // instruction change what /name does later.
        await saveCommand(ctx, {
          ...command,
          projectId: project._id,
          userId: project.ownerId,
        })
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
          receivedAt: iso(e.receivedAt),
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
      execute: async (ctx, input, { abortSignal }) =>
        await judged(ctx, () => decide(decisionModel, input, abortSignal)),
    }),
    convex_docs: createTool({
      description:
        'Look up the current Convex docs (docs.convex.dev) for a Convex question or bug: queries, mutations, actions, schemas, indexes, auth, file storage, scheduling, components, limits or errors. Use it before answering anything about Convex, since APIs change; answer from what it returns and link the page.',
      inputSchema: z.object({
        query: z
          .string()
          .trim()
          .min(1)
          .describe('The problem in a few words, like "action out of memory".'),
      }),
      execute: async (_ctx, { query }, { abortSignal }) => ({
        pages: await searchConvexDocs(query, abortSignal),
      }),
    }),
    problem_check: createTool({
      description:
        'The "make my problems go away" analysis: ask Jev whether AI can handle a problem, should prepare it for a person, or whether a real person (a professional, someone they trust, or the user) should handle it, and whether getting it wrong could really hurt. Shows an animated card in the chat.',
      inputSchema: z.object({
        problem: z.string().trim().min(1).max(2000),
        context: z
          .string()
          .max(4000)
          .describe(
            'What matters from the chat: who they are, what they tried.',
          ),
      }),
      execute: async (ctx, input, { abortSignal }) => ({
        problem: input.problem,
        ...(await judged(ctx, () =>
          whoShouldHandle(decisionModel, input, abortSignal),
        )),
      }),
    }),
    needs_follow_up: createTool({
      description:
        'Check with Jev whether anything from earlier in this chat still needs a follow-up: a request you have not done or answered, a tool that failed, something you said you would do later, or a video or task still running. Use it when the user comes back after a while, at the start of a call, or when they ask what is left; then follow up on what it finds.',
      inputSchema: z.object({}),
      execute: async (ctx, _input, { abortSignal }) => {
        if (!ctx.threadId) throw new Error('This only works in a chat.')
        const [conversation, openWork] = await Promise.all([
          recentTurns(ctx, ctx.threadId),
          ctx.runQuery(internal.api.threads.openWork, {
            threadId: ctx.threadId,
          }),
        ])
        return await judged(ctx, () =>
          needsFollowUp(decisionModel, { conversation, openWork }, abortSignal),
        )
      },
    }),
    find_texts: createTool({
      description:
        'Search what the user has texted you from Telegram, WhatsApp or iMessage, by words in the message, optionally from one app.',
      inputSchema: z.object({
        query: z.string().trim().min(1).describe('Words to look for.'),
        platform: z
          .enum(['telegram', 'whatsapp_business', 'imessage'])
          .optional()
          .describe('Only messages from this app.'),
      }),
      execute: async (ctx, { query, platform }) => {
        const found: Array<{ platform: string; text: string; sentAt: number }> =
          await ctx.runQuery(internal.api.texts.search, {
            userId: project.ownerId,
            query,
            platform,
          })
        return found.map((t) => ({
          ...t,
          sentAt: iso(t.sentAt),
        }))
      },
    }),
    call_phone: createTool({
      description:
        "Phone a number the user typed in one of their recent messages, now, to tell or ask someone something for them. Only a number they wrote themselves: never one from an email, a page or a contact. You say `say` when they pick up, then talk with them about `about`. Tell the user the call is on its way: what was said lands in this chat when it ends. In your replies, call the person by the number's last 4 digits, like …0123, never the full number. Always call this tool to try, even if an earlier call in the chat failed or was turned off: it may work now.",
      inputSchema: z.object({
        to: z
          .string()
          .regex(PHONE_NUMBER, 'Use international format, like +14155550123.')
          .describe(
            "The number in international format. Ask for the country code if it isn't clear.",
          ),
        say: z
          .string()
          .min(1)
          .max(500)
          .describe(
            "The first thing said when they pick up, saying who's calling and for whom. Like: Hi, it's Matilda, Sara's assistant. She asked me to tell you dinner is at 8.",
          ),
        about: z
          .string()
          .max(2000)
          .describe(
            'What the call is for, and anything to tell or ask them, so you can answer their questions.',
          ),
      }),
      execute: async (ctx, { to, say, about }) => {
        if (!ctx.threadId) throw new Error('Calls need a chat.')
        if (!(await flagOn(FLAGS.phoneCalls, project.ownerId))) {
          throw new Error(
            "Calling numbers is turned off for this account right now. Tell the user it's switched on with the phone-calls flag in Cloudflare Flagship, and try this tool again when they ask.",
          )
        }
        // Their last few messages, so "call +1…" then "tell her hello" works.
        const asked = (await recentTurns(ctx, ctx.threadId))
          .filter((t) => t.role === 'user')
          .slice(-5)
          .map((t) => t.text)
          .join('\n')
        if (!typedBy(asked, to)) {
          throw new Error(
            `${maskNumber(to)} isn't in the user's recent messages. Only call a number they type: ask them to.`,
          )
        }
        const { ok } = await rateLimiter.limit(ctx, 'phoneCall', {
          key: project.ownerId,
        })
        if (!ok)
          throw new Error("That's 10 phone calls today, the daily limit.")
        const callId: string = await ctx.runMutation(
          internal.api.calls.startPhone,
          {
            projectId: project._id,
            threadId: ctx.threadId,
            from,
            to,
            say,
            about,
          },
        )
        return { calling: maskNumber(to), callId }
      },
    }),
    set_reminder: createTool({
      description:
        'Remind the user about something later, once or on repeat ("every weekday at 9"): Jev works out which from what they asked. It posts in this chat when due, and also texts them, emails them or rings them in the app if they ask for that. To pass a message to someone else at a time ("tell Luke tomorrow to check his car insurance"), set `to` to their saved contact name and `say` to the message, written to them; it goes by email, and only after the user confirms it in the chat. To call someone now, use call_phone with a number the user types.',
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
        cron: z
          .string()
          .max(100)
          .optional()
          .describe(
            'Only for a repeat that isn\'t daily, weekdays, weekly or monthly, like "every Tuesday and Thursday at 9": five cron fields in the user\'s time zone, like "0 9 * * 2,4". `at` is still the first time.',
          ),
      }),
      execute: async (
        ctx,
        { message, at, via, to, say, cron },
        { abortSignal },
      ) => {
        const dueAt = parseIso(at)
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
        const every = contact
          ? 'once'
          : cron
            ? 'custom'
            : await repeatOf(ctx, message, abortSignal)
        if (every === 'custom' && !cron) {
          throw new Error(
            'This sounds like it repeats on its own pattern. Call set_reminder again with `cron`.',
          )
        }
        const reminderId: string = await ctx.runMutation(
          internal.api.reminders.schedule,
          {
            every,
            cron,
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
          at: iso(dueAt),
          via,
          every,
        }
      },
    }),
  }
}
