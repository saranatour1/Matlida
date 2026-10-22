import { expect, test } from 'vitest'
import { briefingMarkdown, dueDay, parseStories } from '../../lib/news'

test('stories come from the JSON in the answer, and bad ones are dropped', () => {
  const text = `Here you go:
[
  {"headline": "Ceasefire holds", "summary": "Talks resume.", "url": "https://www.reuters.com/a"},
  {"headline": "", "summary": "No headline", "url": "https://x.com/b"},
  {"headline": "Bad link", "summary": "Not the web.", "url": "javascript:alert(1)"},
  {"headline": "Rates cut", "summary": "Banks follow.", "url": "https://ft.com/c"},
  {"headline": "Third", "summary": "Over the cap.", "url": "https://bbc.co.uk/d"}
]
Sources above.`
  expect(parseStories(text, 2)).toEqual([
    {
      headline: 'Ceasefire holds',
      summary: 'Talks resume.',
      url: 'https://www.reuters.com/a',
      source: 'reuters.com',
    },
    {
      headline: 'Rates cut',
      summary: 'Banks follow.',
      url: 'https://ft.com/c',
      source: 'ft.com',
    },
  ])
  expect(parseStories('No news today.', 3)).toEqual([])
  expect(parseStories('[not json]', 3)).toEqual([])
})

test("a daily briefing is due at its hour in the user's zone, once a day", () => {
  // 05:00 UTC is 9am in Dubai.
  const at = Date.parse('2026-10-21T05:10:00Z')
  const dubai = { dailyHour: 9, timeZone: 'Asia/Dubai' }
  expect(dueDay(dubai, at)).toBe('2026-10-21')
  expect(dueDay({ ...dubai, lastSentDay: '2026-10-21' }, at)).toBeNull()
  expect(dueDay({ ...dubai, dailyHour: 8 }, at)).toBeNull()
  expect(dueDay({ timeZone: 'Asia/Dubai' }, at)).toBeNull()
})

test('the daily briefing lists each topic with linked headlines', () => {
  expect(
    briefingMarkdown([
      {
        topic: 'Tech',
        stories: [
          {
            headline: 'Chips',
            summary: 'Prices fell.',
            url: 'https://a.example/1',
            source: 'a.example',
          },
        ],
      },
      { topic: 'Sports', stories: [] },
    ]),
  ).toBe(
    '**Your news for today**\n\n**Tech**\n- [Chips](https://a.example/1): Prices fell.',
  )
})
