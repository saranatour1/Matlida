import { DateTime } from 'luxon'
import type { Doc } from '../../convex/_generated/dataModel'

const EVERY: Record<
  NonNullable<Doc<'reminders'>['repeat']>['every'] | 'once',
  string
> = {
  once: '',
  daily: 'every day',
  weekdays: 'every weekday',
  weekly: 'every week',
  monthly: 'every month',
  custom: 'on repeat',
}

/** When a reminder goes out: "every weekday, from Oct 23, 9:00 AM", or just the time. */
export const reminderWhen = (
  at: number | string,
  every: keyof typeof EVERY = 'once',
) => {
  const time = (
    typeof at === 'number' ? DateTime.fromMillis(at) : DateTime.fromISO(at)
  ).toLocaleString(DateTime.DATETIME_MED)
  const repeat = EVERY[every]
  return repeat ? `${repeat}, from ${time}` : time
}
