import { vGithubProfile } from '@convex-dev/auth/methods/github/server'
import { vGoogleProfile } from '@convex-dev/auth/methods/google/server'
import { v } from 'convex/values'
import { components } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import { authedQuery } from '../../lib/functions'
import type { MutationCtx } from '../../_generated/server'
import type { Infer } from 'convex/values'
import type { Id } from '../../_generated/dataModel'

/** What Convex Auth passes to the user callbacks, for each sign-in method. */
const vProvider = v.union(
  v.object({
    name: v.literal('emailPassword'),
    accountId: v.string(),
    profile: v.object({}),
  }),
  v.object({
    name: v.literal('google'),
    accountId: v.string(),
    profile: vGoogleProfile,
  }),
  v.object({
    name: v.literal('github'),
    accountId: v.string(),
    profile: vGithubProfile,
  }),
)

/** Runs the first time someone signs in with a method. `syncProfile` fills in the row. */
const createUser = internalMutation({
  args: { provider: vProvider },
  returns: v.id('users'),
  handler: async (ctx) => await ctx.db.insert('users', {}),
})

async function profileOf(
  ctx: MutationCtx,
  provider: Infer<typeof vProvider>,
  userId: Id<'users'>,
) {
  switch (provider.name) {
    case 'emailPassword': {
      const email = await ctx.runQuery(
        components.authEmail.verifiedEmails.getPrimaryEmail,
        { userId },
      )
      return { email: email ?? undefined }
    }
    case 'google': {
      const { name, email, emailVerified, picture } = provider.profile
      return { name, email: emailVerified ? email : undefined, image: picture }
    }
    case 'github': {
      const { login, name, email, emailVerified, avatarUrl } = provider.profile
      return {
        name,
        email: emailVerified ? email : undefined,
        image: avatarUrl,
        username: login,
      }
    }
  }
}

/** Runs on every sign-in, so the profile follows changes made at the provider. */
const syncProfile = internalMutation({
  args: { provider: vProvider, userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { provider, userId }) => {
    await ctx.db.patch('users', userId, await profileOf(ctx, provider, userId))
    return null
  },
})

const current = authedQuery({
  args: {},
  handler: async (ctx) => await ctx.db.get('users', ctx.userId),
})

export const usersApi = { createUser, syncProfile, current }
