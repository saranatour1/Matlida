import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import type { Doc, Id } from '../../_generated/dataModel'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import { decryptSecret, encryptSecret } from '../../lib/crypto'
import { authedMutation, authedQuery, zAuthedAction } from '../../lib/functions'
import { checkApiCredentials, sendWithApi } from './api'
import { EMAIL_PROVIDERS } from './providers'
import { emailConnectionsTable } from './table'

/** The signed-in user's email connections, without their secrets. */
const list = authedQuery({
  args: {},
  handler: async (ctx) => {
    const connections = await ctx.db
      .query('emailConnections')
      .withIndex('by_owner', (q) => q.eq('ownerId', ctx.userId))
      .take(20)
    return connections.map((c) => ({
      _id: c._id,
      label: c.label,
      from: c.from,
      kind: c.config.kind,
      status: c.status,
    }))
  },
})

/** Checks the credentials with the provider or SMTP server, then stores them encrypted. */
const add = zAuthedAction({
  args: {
    label: z
      .string()
      .trim()
      .min(1, 'Give the connection a name.')
      .max(40, 'Names can be at most 40 characters.'),
    from: z.string().trim().email('Enter the address to send from.'),
    secret: z
      .string()
      .trim()
      .min(1, 'Paste the key or password.')
      .max(2000, 'That is too long.'),
    config: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('resend') }),
      z.object({ kind: z.literal('postmark') }),
      z.object({
        kind: z.literal('mailgun'),
        domain: z.string().trim().min(3, 'Enter your Mailgun domain.'),
        region: z.enum(['us', 'eu']),
      }),
      z.object({
        kind: z.literal('cloudflare'),
        accountId: z
          .string()
          .trim()
          .regex(/^[a-f0-9]{32}$/, 'Paste the 32-character account ID.'),
      }),
      z.object({
        kind: z.literal('smtp'),
        host: z.string().trim().min(3, 'Enter the SMTP host.'),
        port: z.number().int().min(1).max(65535),
        username: z.string().trim().min(1, 'Enter the SMTP username.'),
      }),
    ]),
  },
  handler: async (ctx, { secret, config, ...connection }) => {
    const encrypted = await encryptSecret(secret, ctx.userId)
    const problem =
      config.kind === 'smtp'
        ? await ctx.runAction(internal.smtp.check, {
            config,
            secret: encrypted,
            ownerId: ctx.userId,
          })
        : (await checkApiCredentials(config, secret))
          ? null
          : `${EMAIL_PROVIDERS[config.kind].name} didn't accept that ${EMAIL_PROVIDERS[config.kind].secretNoun}.`
    if (problem) throw new ConvexError(problem)
    const id: Id<'emailConnections'> = await ctx.runMutation(
      internal.emailConnections.insert,
      {
        ...connection,
        ownerId: ctx.userId,
        config,
        secret: encrypted,
        status: 'valid',
      },
    )
    return id
  },
})

const insert = internalMutation({
  args: emailConnectionsTable.validator.fields,
  returns: v.id('emailConnections'),
  handler: async (ctx, connection) =>
    await ctx.db.insert('emailConnections', connection),
})

const get = internalQuery({
  args: { id: v.id('emailConnections') },
  returns: v.union(
    emailConnectionsTable.validator.extend({
      _id: v.id('emailConnections'),
      _creationTime: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, { id }) => await ctx.db.get('emailConnections', id),
})

const markInvalid = internalMutation({
  args: { id: v.id('emailConnections') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.patch('emailConnections', id, { status: 'invalid' })
    return null
  },
})

const remove = authedMutation({
  args: { id: v.id('emailConnections') },
  handler: async (ctx, { id }) => {
    const connection = await ctx.db.get('emailConnections', id)
    if (connection?.ownerId !== ctx.userId) {
      throw new ConvexError('Connection not found.')
    }
    await ctx.db.delete('emailConnections', id)
  },
})

/** Sends one email through a connection. Rejected credentials mark it invalid. */
const send = internalAction({
  args: {
    connectionId: v.id('emailConnections'),
    to: v.string(),
    subject: v.string(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection: Doc<'emailConnections'> | null = await ctx.runQuery(
      internal.emailConnections.get,
      { id: args.connectionId },
    )
    if (!connection) throw new ConvexError('Email connection not found.')
    if (connection.config.kind === 'smtp') {
      await ctx.runAction(internal.smtp.send, args)
      return null
    }
    const status = await sendWithApi(
      connection.config,
      await decryptSecret(connection.secret, connection.ownerId),
      {
        from: connection.from,
        to: args.to,
        subject: args.subject,
        text: args.text,
      },
    )
    if (status === 401 || status === 403) {
      await ctx.runMutation(internal.emailConnections.markInvalid, {
        id: connection._id,
      })
      throw new ConvexError(
        `${EMAIL_PROVIDERS[connection.config.kind].name} rejected the saved credentials.`,
      )
    }
    if (status >= 300) {
      throw new ConvexError(
        `The email provider refused the message (${status}).`,
      )
    }
    return null
  },
})

export const emailConnectionsApi = {
  list,
  add,
  insert,
  get,
  markInvalid,
  remove,
  send,
}
