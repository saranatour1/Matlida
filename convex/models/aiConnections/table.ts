import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { vEncryptedSecret } from '../../lib/crypto'

/** A user's own AI provider account: a pasted API key or an OpenRouter sign-in. */
export const aiConnectionsTable = defineTable({
  ownerId: v.id('users'),
  label: v.string(),
  kind: literals('apiKey', 'openrouterOAuth'),
  provider: literals('anthropic', 'openai', 'google', 'openrouter'),
  defaultModel: v.string(),
  /** The API key, encrypted with lib/crypto.ts. Never returned to clients. */
  secret: vEncryptedSecret,
  last4: v.string(),
  status: literals('valid', 'invalid'),
}).index('by_owner', ['ownerId'])
