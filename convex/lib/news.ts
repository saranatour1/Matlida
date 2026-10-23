import { generateText } from 'ai'
import { z } from 'zod'
import { zoned } from './time'
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

/** When the next daily briefing goes out: the next `dailyHour` o'clock in the user's zone after `after`. */
export const nextDaily = (
  dailyHour: number,
  timeZone: string | undefined,
  after: number,
) => {
  const today = zoned(after, timeZone).set({
    hour: dailyHour,
    minute: 0,
    second: 0,
    millisecond: 0,
  })
  return (today.toMillis() > after ? today : today.plus({ days: 1 })).toMillis()
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
