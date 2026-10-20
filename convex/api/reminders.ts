import { remindersApi } from '../models/reminders/functions'

export const {
  schedule,
  confirm,
  state,
  list,
  cancel,
  allowContactMessage,
  delivery,
  markSent,
  fire,
  ring,
  ringing,
  pickUp,
  decline,
  miss,
} = remindersApi
