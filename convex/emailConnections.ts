import { emailConnectionsApi } from './models/emailConnections/functions'

export const { list, add, insert, get, markInvalid, remove, send } =
  emailConnectionsApi
