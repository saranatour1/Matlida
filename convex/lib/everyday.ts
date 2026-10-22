/** Math for everyday commands, done in code so the model never adds up money or time zones. */

import { iso, localDayHour, zoned } from './time'

export type Expense = {
  what: string
  amount: number
  paidBy: string
  /** Who shares it. Everyone when unset. */
  splitAmong?: Array<string>
}

/**
 * Who paid what, each person's share, and the fewest payments that settle
 * up. Works in cents: a share that doesn't divide evenly gives the extra
 * cents to the first people sharing it, so totals always match.
 */
export const splitCosts = (people: Array<string>, expenses: Array<Expense>) => {
  const paid = new Map(people.map((p) => [p, 0]))
  const share = new Map(people.map((p) => [p, 0]))
  for (const expense of expenses) {
    const cents = Math.round(expense.amount * 100)
    const among = expense.splitAmong?.length ? expense.splitAmong : people
    paid.set(expense.paidBy, (paid.get(expense.paidBy) ?? 0) + cents)
    among.forEach((person, i) => {
      const each =
        Math.floor(cents / among.length) + (i < cents % among.length ? 1 : 0)
      share.set(person, (share.get(person) ?? 0) + each)
    })
  }
  const balances = people.map((name) => ({
    name,
    paid: paid.get(name) ?? 0,
    share: share.get(name) ?? 0,
  }))
  // Settle the biggest debt against the biggest credit until nothing's owed.
  const owes = balances
    .map((b) => ({ name: b.name, cents: b.share - b.paid }))
    .filter((b) => b.cents > 0)
  const owed = balances
    .map((b) => ({ name: b.name, cents: b.paid - b.share }))
    .filter((b) => b.cents > 0)
  const transfers: Array<{ from: string; to: string; amount: number }> = []
  while (owes.length && owed.length) {
    owes.sort((a, b) => b.cents - a.cents)
    owed.sort((a, b) => b.cents - a.cents)
    const cents = Math.min(owes[0].cents, owed[0].cents)
    transfers.push({
      from: owes[0].name,
      to: owed[0].name,
      amount: cents / 100,
    })
    owes[0].cents -= cents
    owed[0].cents -= cents
    if (!owes[0].cents) owes.shift()
    if (!owed[0].cents) owed.shift()
  }
  return {
    total: balances.reduce((sum, b) => sum + b.paid, 0) / 100,
    people: balances.map((b) => ({
      name: b.name,
      paid: b.paid / 100,
      share: b.share / 100,
    })),
    transfers,
  }
}

const HOUR = 60 * 60_000

/**
 * The time `at` in each zone, and the next 24 hours from `at`'s hour: each
 * zone's local hour, and the windows when everyone is between `workStart`
 * and `workEnd` (24-hour clock).
 */
export const compareTimes = (
  zones: Array<{ label: string; timeZone: string }>,
  at: number,
  { workStart = 9, workEnd = 18 } = {},
) => {
  const start = Math.floor(at / HOUR) * HOUR
  const slots = Array.from({ length: 24 }, (_, i) => start + i * HOUR)
  const first = localDayHour(at, zones[0].timeZone).day
  const rows = zones.map(({ label, timeZone }) => {
    const here = localDayHour(at, timeZone)
    return {
      label,
      timeZone,
      local: zoned(at, timeZone).toFormat('ccc h:mm a'),
      /** -1, 0 or 1: the day here against the first zone's. */
      dayShift: Math.sign(here.day.localeCompare(first)),
      hours: slots.map((slot) => localDayHour(slot, timeZone).hour),
    }
  })
  const good = slots.map((_, i) =>
    rows.every((r) => r.hours[i] >= workStart && r.hours[i] < workEnd),
  )
  const overlap: Array<{ start: string; end: string }> = []
  good.forEach((ok, i) => {
    if (!ok) return
    const end = iso(slots[i] + HOUR)
    if (i > 0 && good[i - 1]) overlap[overlap.length - 1].end = end
    else overlap.push({ start: iso(slots[i]), end })
  })
  return {
    at: iso(at),
    start: iso(start),
    workStart,
    workEnd,
    rows,
    overlap,
  }
}
