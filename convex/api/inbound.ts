import { inboundApi } from '../models/inbound/functions'

export const { receive, facts, verify, route, reply, send, record, answerEmail } =
  inboundApi
