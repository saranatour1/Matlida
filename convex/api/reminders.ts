import { remindersApi } from '../models/reminders/functions'

export const {
  schedule,
  list,
  cancel,
  delivery,
  markSent,
  fire,
  ring,
  ringing,
  pickUp,
  decline,
  miss,
} = remindersApi
