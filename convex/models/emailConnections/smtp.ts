'use node'

import { ConvexError, v } from 'convex/values'
import nodemailer from 'nodemailer'
import { internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import { internalAction } from '../../_generated/server'
import { decryptSecret, vEncryptedSecret } from '../../lib/crypto'

const vSmtpConfig = v.object({
  kind: v.literal('smtp'),
  host: v.string(),
  port: v.number(),
  username: v.string(),
})

/** Port 465 is TLS from the start; other ports must upgrade with STARTTLS. */
function transport(config: typeof vSmtpConfig.type, password: string) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.username, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
}

/** Logs in to the SMTP server without sending anything. */
const check = internalAction({
  args: {
    config: vSmtpConfig,
    secret: vEncryptedSecret,
    ownerId: v.id('users'),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (_ctx, { config, secret, ownerId }) => {
    try {
      await transport(config, await decryptSecret(secret, ownerId)).verify()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  },
})

const send = internalAction({
  args: {
    connectionId: v.id('emailConnections'),
    to: v.string(),
    subject: v.string(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { connectionId, ...email }) => {
    const connection: Doc<'emailConnections'> | null = await ctx.runQuery(
      internal.emailConnections.get,
      { id: connectionId },
    )
    if (connection?.config.kind !== 'smtp') {
      throw new ConvexError('SMTP connection not found.')
    }
    const password = await decryptSecret(connection.secret, connection.ownerId)
    await transport(connection.config, password).sendMail({
      from: connection.from,
      ...email,
    })
    return null
  },
})

export const smtpApi = { check, send }
