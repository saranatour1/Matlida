import { expect, test, vi } from 'vitest'
import { commandOf } from '../lib/analytics'

vi.mock('@databuddy/sdk', () => ({
  track: vi.fn(),
  identify: vi.fn(),
  clearProfile: vi.fn(),
  getProfileId: vi.fn(),
}))

test('commands are reported by built-in name, and your own never by name', () => {
  expect(commandOf('/quiz the French Revolution')).toBe('quiz')
  expect(commandOf('  /PLAN my week')).toBe('plan')
  expect(commandOf('/my-secret-project-notes')).toBe('custom')
  expect(commandOf('hello there')).toBe('none')
})
