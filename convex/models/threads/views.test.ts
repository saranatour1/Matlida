import { expect, test } from 'vitest'
import { BUILT_IN_COMMANDS } from '../../lib/commands'
import { assistantTools } from './tools'
import type { Doc, Id } from '../../_generated/dataModel'

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
  expect(byName.preview.markdown).toContain('preview_post')
  expect(byName.posts.markdown).toContain('preview_post')
})
