import { emailsApi } from '../models/emails/functions'

export const {
  latest,
  receive,
  settle,
  poll,
  forMessages,
  search,
  forReply,
  claimReply,
  unclaimReply,
  replied,
  reply,
} = emailsApi
