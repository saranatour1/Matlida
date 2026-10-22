import { expect, test } from 'vitest'
import { formatAmount } from '../lib/amounts'

test('amounts read like a recipe', () => {
  expect(formatAmount(2)).toBe('2')
  expect(formatAmount(1.5)).toBe('1½')
  expect(formatAmount(0.75)).toBe('¾')
  expect(formatAmount(0.33)).toBe('¼')
  expect(formatAmount(2.9)).toBe('3')
  expect(formatAmount(12.4)).toBe('12')
  expect(formatAmount(0.125)).toBe('0.13')
})
