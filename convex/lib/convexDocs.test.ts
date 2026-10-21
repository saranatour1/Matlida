import { expect, test } from 'vitest'
import { parseIndex, rankPages } from './convexDocs'

const index = `# Convex Documentation

## database

- [Indexes](/database/reading-data/indexes.md): Speed up queries with database indexes
- [Pagination](/database/pagination.md): Load paginated queries
## functions

- [Actions](/functions/actions.md): Call third-party services and run Node.js code
- [Scheduled Functions](/scheduling/scheduled-functions.md): Schedule functions to run later
`

test('the docs index parses, and pages rank by the words they share with the question', () => {
  const pages = parseIndex(index)
  expect(pages).toHaveLength(4)
  expect(pages[2]).toEqual({
    title: 'Actions',
    path: '/functions/actions.md',
    about: 'Call third-party services and run Node.js code',
  })
  expect(
    rankPages(pages, 'my action needs Node.js to call a service').map(
      (p) => p.title,
    ),
  ).toEqual(['Actions'])
  expect(
    rankPages(pages, 'how do I schedule a function to run later?')[0]?.title,
  ).toBe('Scheduled Functions')
  expect(rankPages(pages, 'zzz')).toEqual([])
})
