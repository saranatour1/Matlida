import { expect, test } from 'vitest'
import { redactNumbers, typedBy } from '../../lib/phone'

test('only a number the user typed, however they wrote it', () => {
  expect(typedBy('call +1 (415) 555-0123 please', '+14155550123')).toBe(true)
  expect(typedBy('call 0014155550123', '+14155550123')).toBe(true)
  expect(typedBy('ring my mum on 0791 234 567', '+962791234567')).toBe(true)
  expect(typedBy('call the number in that email', '+14155550123')).toBe(false)
  expect(typedBy('call +1 415 555 0199', '+14155550123')).toBe(false)
})

test("the model can't swap a typed country code, or join two numbers", () => {
  expect(typedBy('call +1 415 555 0123', '+444155550123')).toBe(false)
  expect(typedBy('room 415, code 5550123', '+14155550123')).toBe(false)
})

test('numbers show as their last 4 digits, and dates and prices stay', () => {
  expect(redactNumbers('call me at +49 30 1234 5678 instead')).toBe(
    'call me at …5678 instead',
  )
  expect(redactNumbers('or 0791 234 567, or 00962791234567')).toBe(
    'or …4567, or …4567',
  )
  expect(redactNumbers('on 2026-10-22 at 09:30, for $1,250,000')).toBe(
    'on 2026-10-22 at 09:30, for $1,250,000',
  )
})
