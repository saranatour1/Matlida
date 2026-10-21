import { expect, test } from 'vitest'
import { createAgent } from './lead'
import type { Doc } from '../../_generated/dataModel'

const project = { name: 'Matilda', brief: '' } as Doc<'projects'>
const toolsFor = (via?: 'chat' | 'text' | 'voice') =>
  Object.keys(createAgent(project, { via }).options.tools ?? {})

test('cards show in the app, and texts and calls answer in words instead', () => {
  expect(toolsFor('chat')).toEqual(
    expect.arrayContaining(['show_table', 'show_drafts', 'add_to_list']),
  )
  for (const via of ['text', 'voice'] as const) {
    const tools = toolsFor(via)
    expect(tools).toContain('add_to_list')
    expect(tools).not.toContain('show_table')
    expect(tools).not.toContain('show_drafts')
    expect(tools).not.toContain('show_chart')
  }
})
