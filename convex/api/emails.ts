import { emailsApi } from '../models/emails/functions'

export const {
  latest,
  receive,
  settle,
  poll,
  forThread,
  forReply,
  replied,
  reply,
} = emailsApi
