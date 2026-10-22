import { generateText } from 'ai'
import { z } from 'zod'
import type { LanguageModel } from 'ai'

export type Story = {
  headline: string
  summary: string
  url: string
  /** The site it's from, like reuters.com. */
  source: string
}

/** What the user follows, from their news settings or a one-off ask. */
export type NewsRequest = {
  topics: Array<string>
  regions: Array<string>
  avoid?: string
  perTopic: number
}

const zStory = z.object({
  headline: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(600),
  url: z.url({ protocol: /^https?$/ }),
})

/**
 * The stories in a search model's answer: the first JSON array in it, with
 * badly formed stories and non-web links dropped, at most `max`.
 */
export const parseStories = (text: string, max: number): Array<Story> => {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end < start) return []
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((item) => {
      const story = zStory.safeParse(item)
      if (!story.success) return []
      const source = new URL(story.data.url).hostname.replace(/^www\./, '')
      return [{ ...story.data, source }]
    })
    .slice(0, max)
}

/** The news for each topic, searched side by side, with each search's usage for recording. */
export const fetchNews = async (
  model: LanguageModel,
  { topics, regions, avoid, perTopic }: NewsRequest,
  abortSignal?: AbortSignal,
) => {
  const where = regions.length ? ` Focus on ${regions.join(', ')}.` : ''
  const skip = avoid ? ` Leave out ${avoid}.` : ''
  return await Promise.all(
    topics.map(async (topic) => {
      const result = await generateText({
        model,
        abortSignal,
        prompt: `The ${perTopic} most important news stories from the last 24 hours about ${topic}.${where}${skip} Answer only with a JSON array, most important first: [{"headline": "...", "summary": "one sentence on what happened", "url": "the article's link"}]`,
      })
      return {
        topic,
        stories: parseStories(result.text, perTopic),
        usage: result.usage,
        providerMetadata: result.providerMetadata,
      }
    }),
  )
}

/** The day and hour it is in `timeZone`. */
const localNow = (now: number, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: +parts.hour }
}

/** Whether a daily briefing should go out now: its hour in the user's zone, and not sent today. Returns the day to mark sent. */
export const dueDay = (
  settings: { dailyHour?: number; timeZone?: string; lastSentDay?: string },
  now: number,
) => {
  if (settings.dailyHour === undefined) return null
  const { day, hour } = localNow(now, settings.timeZone ?? 'UTC')
  return hour === settings.dailyHour && day !== settings.lastSentDay
    ? day
    : null
}

/** A briefing as a chat message, for the daily one, which posts without a card. */
export const briefingMarkdown = (
  sections: Array<{ topic: string; stories: Array<Story> }>,
) => {
  return [
    '**Your news for today**',
    ...sections
      .filter((s) => s.stories.length)
      .map(
        (s) =>
          `**${s.topic}**\n${s.stories
            .map(
              (story) =>
                `- [${story.headline}](${story.url}): ${story.summary}`,
            )
            .join('\n')}`,
      ),
  ].join('\n\n')
}
