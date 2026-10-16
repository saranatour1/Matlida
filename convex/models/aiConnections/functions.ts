import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import type { Id } from '../../_generated/dataModel'
import { internalMutation } from '../../_generated/server'
import { checkApiKey, GATEWAY_MODEL } from '../../lib/ai'
import { encryptSecret } from '../../lib/crypto'
import { authedMutation, authedQuery, zAuthedAction } from '../../lib/functions'
import { PROVIDERS } from './providers'
import { aiConnectionsTable } from './table'

/** The signed-in user's connections, without their secrets. */
const list = authedQuery({
  args: {},
  handler: async (ctx) => {
    const connections = await ctx.db
      .query('aiConnections')
      .withIndex('by_owner', (q) => q.eq('ownerId', ctx.userId))
      .take(20)
    return connections.map((c) => ({
      _id: c._id,
      label: c.label,
      kind: c.kind,
      provider: c.provider,
      defaultModel: c.defaultModel,
      last4: c.last4,
      status: c.status,
    }))
  },
})

/** Checks a pasted API key with the provider, then stores it encrypted. */
const add = zAuthedAction({
  args: {
    provider: z.enum(['anthropic', 'openai', 'google', 'openrouter']),
    label: z
      .string()
      .trim()
      .min(1, 'Give the connection a name.')
      .max(40, 'Names can be at most 40 characters.'),
    apiKey: z
      .string()
      .trim()
      .min(8, 'Paste the whole API key.')
      .max(500, 'That key is too long.'),
    defaultModel: z
      .string()
      .trim()
      .min(1, 'Name the model to use.')
      .max(100, 'Model names can be at most 100 characters.'),
  },
  handler: async (ctx, { apiKey, ...connection }) => {
    if (!(await checkApiKey(connection.provider, apiKey))) {
      throw new ConvexError(
        `${PROVIDERS[connection.provider].name} didn't accept that key.`,
      )
    }
    const id: Id<'aiConnections'> = await ctx.runMutation(
      internal.aiConnections.insert,
      {
        ...connection,
        ownerId: ctx.userId,
        kind: 'apiKey',
        secret: await encryptSecret(apiKey, ctx.userId),
        last4: apiKey.slice(-4),
        status: 'valid',
      },
    )
    return id
  },
})

/** Finishes OpenRouter's OAuth (PKCE): trades the code for a key billed to the user's OpenRouter account. */
const connectOpenRouter = zAuthedAction({
  args: {
    code: z.string().min(1),
    codeVerifier: z.string().min(43).max(128),
  },
  handler: async (ctx, { code, codeVerifier }) => {
    const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        code_challenge_method: 'S256',
      }),
    })
    const body = z
      .object({ key: z.string() })
      .safeParse(response.ok ? await response.json() : null)
    if (!body.success) {
      throw new ConvexError("OpenRouter didn't finish connecting. Try again.")
    }
    const id: Id<'aiConnections'> = await ctx.runMutation(
      internal.aiConnections.insert,
      {
        ownerId: ctx.userId,
        label: 'OpenRouter',
        kind: 'openrouterOAuth',
        provider: 'openrouter',
        defaultModel: GATEWAY_MODEL,
        secret: await encryptSecret(body.data.key, ctx.userId),
        last4: body.data.key.slice(-4),
        status: 'valid',
      },
    )
    return id
  },
})

const insert = internalMutation({
  args: aiConnectionsTable.validator.fields,
  returns: v.id('aiConnections'),
  handler: async (ctx, connection) =>
    await ctx.db.insert('aiConnections', connection),
})

const markInvalid = internalMutation({
  args: { id: v.id('aiConnections') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.patch('aiConnections', id, { status: 'invalid' })
    return null
  },
})

/** Deletes a connection. Projects that used it go back to the Convex AI Gateway. */
const remove = authedMutation({
  args: { id: v.id('aiConnections') },
  handler: async (ctx, { id }) => {
    const connection = await ctx.db.get('aiConnections', id)
    if (connection?.ownerId !== ctx.userId) {
      throw new ConvexError('Connection not found.')
    }
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_owner', (q) => q.eq('ownerId', ctx.userId))
      .take(50)
    for (const project of projects) {
      if (project.aiConnectionId === id) {
        await ctx.db.patch('projects', project._id, {
          aiConnectionId: undefined,
          model: undefined,
        })
      }
    }
    await ctx.db.delete('aiConnections', id)
  },
})

export const aiConnectionsApi = {
  list,
  add,
  connectOpenRouter,
  insert,
  markInvalid,
  remove,
}
