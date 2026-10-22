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
  pause,
  resume,
  settle,
  snooze,
  callAgain,
  miss,
} = remindersApi
