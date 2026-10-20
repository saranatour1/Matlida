import { expect, test } from 'vitest'
import { RULES } from './rules'

test('every rule is one markdown list item with its title in bold', () => {
  const ids = RULES.map((r) => r.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const rule of RULES) {
    expect(rule.markdown).toMatch(/^- \*\*[^*]+\.\*\* .+$/)
    expect(rule.markdown).not.toContain('\n')
  }
  expect(RULES.map((r) => r.title)).toContain('No malware or attacks')
})
