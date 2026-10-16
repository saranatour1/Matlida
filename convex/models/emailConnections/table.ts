import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { vEncryptedSecret } from '../../lib/crypto'

/** How one email connection sends. Settings that aren't secret live here. */
export const vEmailConfig = v.union(
  v.object({ kind: v.literal('resend') }),
  v.object({ kind: v.literal('postmark') }),
  v.object({
    kind: v.literal('mailgun'),
    domain: v.string(),
    region: literals('us', 'eu'),
  }),
  v.object({ kind: v.literal('cloudflare'), accountId: v.string() }),
  v.object({
    kind: v.literal('smtp'),
    host: v.string(),
    port: v.number(),
    username: v.string(),
  }),
)

/** A user's way to send email: a provider API key or their own SMTP server. */
export const emailConnectionsTable = defineTable({
  ownerId: v.id('users'),
  label: v.string(),
  /** The address mail is sent from. */
  from: v.string(),
  config: vEmailConfig,
  /** API key or SMTP password, encrypted with lib/crypto.ts. */
  secret: vEncryptedSecret,
  status: literals('valid', 'invalid'),
}).index('by_owner', ['ownerId'])
