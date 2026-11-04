import { expect, test } from 'vitest'
import { wantsMarkdown } from '../lib/content-negotiation'

test('agents that ask for markdown get it', () => {
  expect(wantsMarkdown('text/markdown')).toBe(true)
  expect(wantsMarkdown('TEXT/MARKDOWN; charset=utf-8')).toBe(true)
  expect(wantsMarkdown('text/markdown, text/html, */*')).toBe(true)
  expect(wantsMarkdown('text/markdown, text/html;q=0.9')).toBe(true)
})

test('everyone else keeps getting HTML', () => {
  expect(wantsMarkdown(null)).toBe(false)
  expect(wantsMarkdown('*/*')).toBe(false)
  expect(
    wantsMarkdown(
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    ),
  ).toBe(false)
  expect(wantsMarkdown('text/html, text/markdown;q=0.5')).toBe(false)
  expect(wantsMarkdown('text/markdown;q=0.5, */*')).toBe(false)
  expect(wantsMarkdown('text/markdown;q=0')).toBe(false)
})
