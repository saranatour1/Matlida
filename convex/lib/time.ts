import { DateTime, IANAZone } from 'luxon'

/**
 * Dates and times, through luxon, for the backend and the browser alike
 * (AGENTS.md). Times are milliseconds since 1970 unless a name says ISO.
 */

/** `at` in `timeZone`, or in UTC when the zone isn't one luxon knows. */
export const zoned = (at: number, timeZone = 'UTC') => {
  const time = DateTime.fromMillis(at, { zone: timeZone })
  return time.isValid ? time : DateTime.fromMillis(at, { zone: 'utc' })
}

/** Whether `timeZone` is an IANA zone, like Europe/London. */
export const isTimeZone = (timeZone: string) => IANAZone.isValidZone(timeZone)

/** `at` as ISO 8601 in UTC, like 2026-10-22T12:00:00.000Z. */
export const iso = (at: number) =>
  DateTime.fromMillis(at, { zone: 'utc' }).toISO() ?? ''

/** An ISO 8601 time as milliseconds, or NaN when it isn't one. */
export const parseIso = (text: string) =>
  DateTime.fromISO(text, { setZone: true }).toMillis()

/** The day (YYYY-MM-DD) and hour (0–23) it is at `at` in `timeZone`. */
export const localDayHour = (at: number, timeZone?: string) => {
  const time = zoned(at, timeZone)
  return { day: time.toISODate() ?? '', hour: time.hour }
}

/** The IANA zone this browser or runtime is in. */
export const localTimeZone = () => DateTime.local().zoneName
