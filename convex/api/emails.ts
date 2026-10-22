import { emailsApi } from '../models/emails/functions'

export const {
  latest,
  unseen,
  schedulePoll,
  receive,
  skip,
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
