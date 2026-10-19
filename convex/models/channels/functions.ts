import { v } from 'convex/values'
import { env } from '../../_generated/server'
import { CHANNELS, channelStatus } from '../../lib/channels'
import { authedQuery } from '../../lib/functions'
import { getOwnedProject } from '../projects/functions'
import { getLinks } from '../texts/functions'
import type { EnvName } from '../../lib/channels'

/** The env vars the channels need that are set on this deployment. Names only, never values. */
function presentEnv(): Array<EnvName> {
  const names = new Set(CHANNELS.flatMap((channel) => channel.env))
  return [...names].filter((name) => Boolean(env[name]))
}

/**
 * Every channel's status for a project: what's connected, what's one step
 * away, and what still needs the deployment set up.
 */
const list = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    const links = await getLinks(ctx, projectId)
    const facts = {
      env: presentEnv(),
      linked: links.flatMap((link) =>
        link.status === 'linked' ? [link.platform ?? 'imessage'] : [],
      ),
      mailbox: null,
    }
    return CHANNELS.map((channel) => ({
      id: channel.id,
      ...channelStatus(channel, facts),
    }))
  },
})

export const channelsApi = { list }
