import { expect, test } from 'vitest'
import { addressee } from './addressee'

const people = [
  { name: 'Matilda', bot: null },
  { name: 'Ivy', bot: 'ivy' },
  { name: 'Ivy Lee', bot: 'ivy-lee' },
]

test('picks the longest matching name and strips the tag', () => {
  expect(addressee('@ivy, find a cafe', people)).toEqual({
    bot: 'ivy',
    rest: 'find a cafe',
  })
  expect(addressee('@Ivy Lee: hello', people)).toEqual({
    bot: 'ivy-lee',
    rest: 'hello',
  })
  expect(addressee('@matilda', people)).toEqual({ bot: null, rest: '' })
})

test('needs a word boundary after the name', () => {
  expect(addressee('@ivyx hi', people)).toBeNull()
  expect(addressee('hi @ivy', people)).toBeNull()
  expect(addressee('@bob hi', people)).toBeNull()
})
