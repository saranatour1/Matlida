import { expect, test } from 'vitest'
import {
  RESERVED_HANDLES,
  addressOf,
  handleOf,
  parseHandle,
} from '../../lib/handles'

test('a handle is trimmed, lowercased and checked', () => {
  expect(parseHandle('  Ada.Lovelace ')).toEqual({
    ok: true,
    handle: 'ada.lovelace',
  })
  expect(parseHandle('a-b_c9')).toEqual({ ok: true, handle: 'a-b_c9' })
})

test('too short, too long and odd characters are refused with a reason', () => {
  expect(parseHandle('ab')).toMatchObject({
    ok: false,
    reason: 'Handles are 3 to 32 characters.',
  })
  expect(parseHandle('a'.repeat(33))).toMatchObject({ ok: false })
  expect(parseHandle('a'.repeat(32))).toMatchObject({ ok: true })
  for (const bad of [
    'ada lovelace',
    'ada@example',
    'äda',
    'ada+tag',
    'ada/x',
  ]) {
    expect(parseHandle(bad)).toMatchObject({
      ok: false,
      reason:
        'Use only lowercase letters, digits, dots, dashes and underscores.',
    })
  }
})

test('dots can’t lead, trail or double up', () => {
  for (const bad of ['.ada', 'ada.', 'ada..b']) {
    expect(parseHandle(bad)).toMatchObject({
      ok: false,
      reason: 'A handle can’t start or end with a dot, or have two in a row.',
    })
  }
})

test('role names are reserved', () => {
  for (const name of [
    'postmaster',
    'abuse',
    'admin',
    'administrator',
    'root',
    'hostmaster',
    'webmaster',
    'security',
    'noreply',
    'no-reply',
    'mailer-daemon',
    'support',
    'info',
    'billing',
    'matilda',
  ]) {
    expect(RESERVED_HANDLES.has(name)).toBe(true)
    expect(parseHandle(name.toUpperCase())).toEqual({
      ok: false,
      reason: 'That name is reserved. Pick another.',
    })
  }
  for (const name of RESERVED_HANDLES) {
    // Every reserved name is itself a well-formed handle, so the list stays honest.
    expect(name).toMatch(/^[a-z0-9._-]{3,32}$/)
  }
})

test('addresses are built and read back for the mail domain only', () => {
  expect(addressOf('ada', 'mail.example.com')).toBe('ada@mail.example.com')
  expect(handleOf('Ada@Mail.Example.com', 'mail.example.com')).toBe('ada')
  expect(handleOf('ada@other.example.com', 'mail.example.com')).toBeNull()
  expect(handleOf('ada', 'mail.example.com')).toBeNull()
  expect(handleOf('@mail.example.com', 'mail.example.com')).toBeNull()
})
