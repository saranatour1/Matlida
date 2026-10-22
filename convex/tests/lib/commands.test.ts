import { expect, test } from 'vitest'
import { assistantTools } from '../../models/threads/tools'
import { BUILT_IN_COMMANDS } from '../../lib/commands'
import type { Doc } from '../../lib/ctx'

test('every tool a built-in command names exists', () => {
  const tools = new Set([
    ...Object.keys(assistantTools({} as Doc<'projects'>, 'Matilda')),
    'ask_bot',
  ])
  for (const command of BUILT_IN_COMMANDS) {
    for (const name of command.markdown.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ??
      []) {
      expect(tools, `/${command.name} names ${name}`).toContain(name)
    }
  }
})

test('built-in command names are unique', () => {
  const names = BUILT_IN_COMMANDS.map((c) => c.name)
  expect(new Set(names).size).toBe(names.length)
})
