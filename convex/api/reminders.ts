import { remindersApi } from '../models/reminders/functions'

export const {
  schedule,
  list,
  cancel,
  callStatus,
  delivery,
  markSent,
  fire,
} = remindersApi
