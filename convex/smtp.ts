'use node'

import { smtpApi } from './models/emailConnections/smtp'

export const { check, send } = smtpApi
