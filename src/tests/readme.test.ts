import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { BUILT_IN_COMMANDS } from '@convex/lib/commands'

// Here, not in convex/tests: convex dev typechecks convex/ without Node's types.
test('the README lists every built-in command', () => {
  const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8')
  const missing = BUILT_IN_COMMANDS.filter(
    (c) => !readme.includes(`\`/${c.name}\``),
  ).map((c) => c.name)
  expect(missing).toEqual([])
})
