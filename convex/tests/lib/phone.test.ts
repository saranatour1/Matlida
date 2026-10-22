import { expect, test } from 'vitest'
import { typedBy } from '../../lib/phone'

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
