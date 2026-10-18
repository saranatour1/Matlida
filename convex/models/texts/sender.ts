'use node'

import { createCloudSender } from '@spectrum-ts/convex/sender'
import { v } from 'convex/values'
import { internalAction } from '../../_generated/server'
import { spectrum } from './spectrum'

// One Photon runtime per container, reused across sends.
const sender = createCloudSender()

/** Delivers one outbox row over Photon's gRPC transport, then reports back to the outbox. */
const deliver = internalAction({
  args: {
    rowId: v.string(),
    spaceId: v.string(),
    phone: v.optional(v.string()),
    clientGuid: v.string(),
    kind: v.string(),
    content: v.optional(v.any()),
    targetMessageId: v.optional(v.string()),
    reaction: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, job) => {
    const outcome = await sender.deliver(job)
    await spectrum.settle(ctx, { rowId: job.rowId, ...outcome })
    return null
  },
})

export const senderApi = { deliver }
