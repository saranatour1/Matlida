import { v } from 'convex/values'
import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { createLead } from '../threads/lead'
import type { Doc } from '../../_generated/dataModel'

// Apart from ./functions, so the texting queries and mutations don't load the AI SDK.

/** What to text back to a message from `spaceId`. Links the phone or runs the lead. */
const answer = internalAction({
  args: { spaceId: v.string(), text: v.string() },
  returns: v.string(),
  handler: async (ctx, { spaceId, text }): Promise<string> => {
    const code = /^link\s+([a-z0-9]{6})$/i.exec(text.trim())?.[1]
    if (code) {
      const name: string | null = await ctx.runMutation(
        internal.api.texts.claim,
        { code, spaceId },
      )
      return name
        ? `Linked to ${name}. Text me anytime.`
        : "That code didn't match. Get a new one on the Texting page in Matilda."
    }
    const linked: {
      project: Doc<'projects'>
      bots: Array<Doc<'bots'>>
      threadId: string
    } | null = await ctx.runMutation(internal.api.texts.forSpace, { spaceId })
    if (!linked) {
      return "This number isn't linked yet. Open Texting in Matilda and text me the code it shows."
    }
    const { project, bots, threadId } = linked
    const lead = createLead(project, bots, { viaText: true })
    const reply = await lead.agent.generateText(
      ctx,
      { threadId, userId: project.ownerId },
      { prompt: text, tools: lead.tools },
    )
    return reply.text
  },
})

export const replyApi = { answer }
