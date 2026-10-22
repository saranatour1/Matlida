import { expect, test } from 'vitest'
import { AUTH_METHODS, enabledMethods } from '../../lib/authMethods'

test('unset or empty AUTH_METHODS offers every sign-in method', () => {
  expect(enabledMethods(undefined)).toEqual([...AUTH_METHODS])
  expect(enabledMethods(' ')).toEqual([...AUTH_METHODS])
})

test('a list turns on only those, in any case and spacing', () => {
  expect(enabledMethods('github')).toEqual(['github'])
  expect(enabledMethods(' GitHub , email ')).toEqual(['email', 'github'])
})

test('a typo stops the deploy instead of locking everyone out', () => {
  expect(() => enabledMethods('githb')).toThrow(
    'unknown sign-in methods: githb',
  )
})
