import { remindersApi } from '../models/reminders/functions'

export const {
  schedule,
  list,
  cancel,
  delivery,
  markSent,
  fire,
} = remindersApi
