/** Math for everyday commands, done in code so the model never adds up money or time zones. */

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
export function splitCosts(people: Array<string>, expenses: Array<Expense>) {
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

/** Whether `timeZone` is an IANA zone this runtime knows, like Europe/London. */
export function isTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

const HOUR = 60 * 60_000

function localParts(at: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: +parts.hour }
}

/**
 * The time `at` in each zone, and the next 24 hours from `at`'s hour: each
 * zone's local hour, and the windows when everyone is between `workStart`
 * and `workEnd` (24-hour clock).
 */
export function compareTimes(
  zones: Array<{ label: string; timeZone: string }>,
  at: number,
  { workStart = 9, workEnd = 18 } = {},
) {
  const start = Math.floor(at / HOUR) * HOUR
  const slots = Array.from({ length: 24 }, (_, i) => start + i * HOUR)
  const first = localParts(at, zones[0].timeZone).day
  const rows = zones.map(({ label, timeZone }) => {
    const here = localParts(at, timeZone)
    return {
      label,
      timeZone,
      local: new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(at),
      /** -1, 0 or 1: the day here against the first zone's. */
      dayShift: Math.sign(Date.parse(here.day) - Date.parse(first)),
      hours: slots.map((slot) => localParts(slot, timeZone).hour),
    }
  })
  const good = slots.map((_, i) =>
    rows.every((r) => r.hours[i] >= workStart && r.hours[i] < workEnd),
  )
  const overlap: Array<{ start: string; end: string }> = []
  good.forEach((ok, i) => {
    if (!ok) return
    const end = new Date(slots[i] + HOUR).toISOString()
    if (i > 0 && good[i - 1]) overlap[overlap.length - 1].end = end
    else overlap.push({ start: new Date(slots[i]).toISOString(), end })
  })
  return {
    at: new Date(at).toISOString(),
    start: new Date(start).toISOString(),
    workStart,
    workEnd,
    rows,
    overlap,
  }
}
