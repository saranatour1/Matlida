import { expect, test } from 'vitest'
import { BUILT_IN_COMMANDS } from '../../lib/commands'
import { assistantTools } from '../../models/threads/tools'
import type { Doc, Id } from '../../lib/ctx'

const project = {
  _id: 'p1' as Id<'projects'>,
  name: 'Matilda',
} as Doc<'projects'>
const tools = assistantTools(project, 'Ivy')

const chart = {
  title: 'Signups',
  kind: 'bar',
  series: ['Web', 'Telegram'],
  points: [
    { label: 'Mon', values: [3, 1] },
    { label: 'Tue', values: [5, 2] },
  ],
}

test('a chart needs one value per series, and a pie has one series', async () => {
  const schema = tools.show_chart.inputSchema as {
    safeParseAsync: (v: unknown) => Promise<{ success: boolean }>
  }
  expect((await schema.safeParseAsync(chart)).success).toBe(true)
  expect(
    (
      await schema.safeParseAsync({
        ...chart,
        points: [{ label: 'Mon', values: [3] }],
      })
    ).success,
  ).toBe(false)
  expect((await schema.safeParseAsync({ ...chart, kind: 'pie' })).success).toBe(
    false,
  )
})

test('/chart and /preview are built in, and /posts previews its drafts', () => {
  const byName = Object.fromEntries(BUILT_IN_COMMANDS.map((c) => [c.name, c]))
  expect(byName.chart.markdown).toContain('show_chart')
  expect(byName.preview.markdown).toContain('preview_posts')
  expect(byName.posts.markdown).toContain('preview_posts')
})

test('previews come as sets: several labelled versions, Discord included, at most twelve', async () => {
  const schema = tools.preview_posts.inputSchema as {
    safeParseAsync: (v: unknown) => Promise<{ success: boolean }>
  }
  const posts = ['Punchy', 'Story', 'Question'].flatMap((label) =>
    (['linkedin', 'x', 'discord'] as const).map((platform) => ({
      platform,
      label,
      text: `${label} post`,
      ...(platform === 'discord' && { channel: 'announcements' }),
    })),
  )
  expect((await schema.safeParseAsync({ posts })).success).toBe(true)
  expect(
    (await schema.safeParseAsync({ posts: [...posts, ...posts] })).success,
  ).toBe(false)
})
