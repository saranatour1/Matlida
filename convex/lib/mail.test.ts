import { expect, test } from 'vitest'
import {
  MAX_PROMPT_CHARS,
  bareAddress,
  replyReferences,
  replySubject,
  stripQuotes,
  stripReplyPrefix,
} from './mail'

test('addresses are read bare and lowercase, with or without a display name', () => {
  expect(bareAddress('Ada Lovelace <Ada@Example.com>')).toBe('ada@example.com')
  expect(bareAddress('ada@example.com')).toBe('ada@example.com')
  expect(bareAddress('"Ada" <ada@example.com>')).toBe('ada@example.com')
  expect(bareAddress('not an address')).toBeNull()
  expect(bareAddress('<>')).toBeNull()
})

test('reply prefixes are stripped and one Re: is added back', () => {
  expect(stripReplyPrefix('Re: RE: Fwd: Plan')).toBe('Plan')
  expect(stripReplyPrefix('Plan')).toBe('Plan')
  expect(replySubject('Re: Plan')).toBe('Re: Plan')
  expect(replySubject('')).toBe('Re: your email')
})

test('quoted history, "On … wrote:" and signatures are cut', () => {
  const text = [
    'Can you plan my week?',
    '',
    'Thanks',
    '',
    'On Mon, Oct 20, 2026 at 9:00 AM Matilda <ada@mail.example.com> wrote:',
    '> Earlier reply',
    '> more',
  ].join('\r\n')
  expect(stripQuotes(text)).toBe('Can you plan my week?\n\nThanks')
  expect(stripQuotes('Hi\n-- \nAda\n+1 555')).toBe('Hi')
  expect(
    stripQuotes('Hi\n\n---------- Forwarded message ---------\nFrom: x'),
  ).toBe('Hi')
  expect(stripQuotes('Hi\n\nFrom: Bob\nSent: today\n')).toBe('Hi')
  expect(stripQuotes('From: me is not a header here')).toBe(
    'From: me is not a header here',
  )
})

test('the prompt is capped', () => {
  expect(stripQuotes('a'.repeat(MAX_PROMPT_CHARS + 5))).toHaveLength(
    MAX_PROMPT_CHARS,
  )
})

test('references keep the thread and end with the message replied to', () => {
  expect(replyReferences(undefined, '<m3@x>')).toBe('<m3@x>')
  expect(replyReferences('<m1@x> <m2@x>', '<m3@x>')).toBe(
    '<m1@x> <m2@x> <m3@x>',
  )
  expect(replyReferences('<m1@x>  <m3@x>', '<m3@x>')).toBe('<m1@x> <m3@x>')
})
