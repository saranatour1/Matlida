import { expect, test } from 'vitest'
import { compareTimes, splitCosts } from '../../lib/everyday'
import { isTimeZone } from '../../lib/time'

test('splitting costs: shares, odd cents and the fewest payments', () => {
  const result = splitCosts(
    ['Ana', 'Ben', 'Cy'],
    [
      { what: 'Dinner', amount: 90, paidBy: 'Ana' },
      { what: 'Taxi', amount: 10, paidBy: 'Ben', splitAmong: ['Ben', 'Cy'] },
      { what: 'Snacks', amount: 10, paidBy: 'Cy' },
    ],
  )
  expect(result.total).toBe(110)
  expect(result.people).toEqual([
    { name: 'Ana', paid: 90, share: 33.34 },
    { name: 'Ben', paid: 10, share: 38.33 },
    { name: 'Cy', paid: 10, share: 38.33 },
  ])
  expect(result.transfers).toEqual([
    { from: 'Ben', to: 'Ana', amount: 28.33 },
    { from: 'Cy', to: 'Ana', amount: 28.33 },
  ])
  const settled = result.transfers.reduce((sum, t) => sum + t.amount, 0)
  expect(Math.round(settled * 100)).toBe(5666)
})

test('when everyone paid their share, nobody pays anybody', () => {
  expect(
    splitCosts(
      ['Ana', 'Ben'],
      [
        { what: 'Lunch', amount: 20, paidBy: 'Ana' },
        { what: 'Coffee', amount: 20, paidBy: 'Ben' },
      ],
    ).transfers,
  ).toEqual([])
})

test('time zones: local times, the day each is on, and the hours everyone works', () => {
  // 15:00 UTC on a Wednesday in winter: 10am in New York, 3pm in London, midnight in Tokyo.
  const at = Date.parse('2026-12-02T15:00:00Z')
  const result = compareTimes(
    [
      { label: 'New York', timeZone: 'America/New_York' },
      { label: 'London', timeZone: 'Europe/London' },
      { label: 'Tokyo', timeZone: 'Asia/Tokyo' },
    ],
    at,
  )
  expect(result.rows.map((r) => [r.label, r.local, r.dayShift])).toEqual([
    ['New York', 'Wed 10:00 AM', 0],
    ['London', 'Wed 3:00 PM', 0],
    ['Tokyo', 'Thu 12:00 AM', 1],
  ])
  expect(result.rows[0].hours.slice(0, 3)).toEqual([10, 11, 12])
  // Nobody's working day overlaps all three. New York and London overlap from
  // 10am to 1pm in New York today, and again from 9am tomorrow.
  expect(result.overlap).toEqual([])
  expect(compareTimes(result.rows.slice(0, 2), at).overlap).toEqual([
    { start: '2026-12-02T15:00:00.000Z', end: '2026-12-02T18:00:00.000Z' },
    { start: '2026-12-03T14:00:00.000Z', end: '2026-12-03T15:00:00.000Z' },
  ])
})

test('only real time zones count', () => {
  expect(isTimeZone('Europe/Lisbon')).toBe(true)
  expect(isTimeZone('Mars/Olympus')).toBe(false)
})
