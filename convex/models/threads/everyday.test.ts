import { expect, test, vi } from 'vitest'
import { READ_ONLY_TOOLS, createAgent } from './lead'
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
