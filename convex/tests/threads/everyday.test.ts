import { expect, test, vi } from 'vitest'
import { READ_ONLY_TOOLS, createAgent } from '../../models/threads/lead'
import type { ActionCtx, Doc } from '../../lib/ctx'

vi.mock('../../lib/budget', () => import('../../test.budget'))

const project = { name: 'Matilda', brief: '' } as Doc<'projects'>
const ctx = {} as ActionCtx
const toolsFor = (via?: 'chat' | 'text' | 'voice') =>
  Object.keys(createAgent(ctx, project, { via }).options.tools ?? {})

test('cards show in the app, and texts and calls answer in words instead', () => {
  expect(toolsFor('chat')).toEqual(
    expect.arrayContaining([
      'show_table',
      'show_drafts',
      'add_to_list',
      'start_timer',
      'get_today',
      'generate_image',
      'generate_video',
    ]),
  )
  for (const via of ['text', 'voice'] as const) {
    const tools = toolsFor(via)
    expect(tools).toEqual(
      expect.arrayContaining(['add_to_list', 'get_today', 'split_costs']),
    )
    expect(tools).not.toContain('show_table')
    expect(tools).not.toContain('show_drafts')
    expect(tools).not.toContain('show_chart')
    expect(tools).not.toContain('show_timeline')
    expect(tools).not.toContain('start_timer')
  }
})

test('calls can make pictures and videos, which show in the chat beside them, and texts can’t', () => {
  expect(toolsFor('voice')).toEqual(
    expect.arrayContaining(['generate_image', 'generate_video']),
  )
  expect(toolsFor('text')).not.toContain('generate_image')
  expect(toolsFor('text')).not.toContain('generate_video')
})

test('every tool an email draft may use is a real tool, so a typo can’t drop one', () => {
  const ivy = { _id: 'ivy', name: 'Ivy', role: 'Researcher' } as Doc<'bots'>
  const all = Object.keys(
    createAgent(ctx, project, { members: [ivy] }).options.tools ?? {},
  )
  for (const tool of [...READ_ONLY_TOOLS, 'find_emails']) {
    expect(all).toContain(tool)
  }
})

test('add_to_list calls in one step run one at a time, so they don’t race on the list', async () => {
  const { everydayTools } = await import('../../models/threads/everyday')
  let running = 0
  let most = 0
  const fake = {
    threadId: 't1',
    runMutation: async () => {
      most = Math.max(most, ++running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return 'plan1'
    },
  }
  const tool = { ...everydayTools(project).add_to_list, ctx: fake }
  const call = (text: string) =>
    tool.execute!(
      { list: 'Shopping list', items: [{ text }] },
      { toolCallId: text, messages: [], context: {} },
    )
  const results = await Promise.all([call('milk'), call('eggs'), call('bread')])
  expect(most).toBe(1)
  expect(results).toEqual(
    Array(3).fill({ planId: 'plan1', added: 1 }),
  )
})
