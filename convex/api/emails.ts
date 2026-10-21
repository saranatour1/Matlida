import { emailsApi } from '../models/emails/functions'

export const {
  latest,
  receive,
  settle,
  poll,
  forThread,
  search,
  forReply,
  replied,
  reply,
} = emailsApi
