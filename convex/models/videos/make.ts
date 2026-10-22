'use node'

import { experimental_generateVideo as generateVideo } from 'ai'
import { v } from 'convex/values'
import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { videoModel } from '../../lib/ai'
import { metered } from '../../lib/budget'
import { MODELS } from '../../lib/models'
import { gatewayCost } from '../usage/functions'
import { videosTable } from './table'

const FORMATS = {
  wide: { aspectRatio: '16:9', resolution: '1280x720' },
  tall: { aspectRatio: '9:16', resolution: '720x1280' },
} as const

/**
 * Makes the video (the gateway waits for it, up to about five minutes) and
 * saves it in storage. In Node, because a video and its copies outgrow the
 * default runtime's 64 MB.
 */
const make = internalAction({
  args: {
    id: v.id('videos'),
    userId: v.id('users'),
    projectId: v.id('projects'),
    threadId: v.string(),
    prompt: v.string(),
    shape: videosTable.validator.fields.shape,
  },
  returns: v.null(),
  handler: async (ctx, { id, userId, projectId, threadId, prompt, shape }) => {
    try {
      const { video, providerMetadata } = await metered(
        ctx,
        { userId, model: MODELS.video, estimate: 0.8 },
        async () => {
          const made = await generateVideo({
            model: videoModel,
            prompt,
            duration: 8,
            ...FORMATS[shape],
          })
          return { result: made, cost: gatewayCost(made.providerMetadata) }
        },
      )
      const storageId = await ctx.storage.store(
        new Blob([new Uint8Array(video.uint8Array)], { type: video.mediaType }),
      )
      await ctx.runMutation(internal.api.usage.record, {
        projectId,
        threadId,
        kind: 'media',
        label: 'Video',
        model: MODELS.video,
        aiCost: gatewayCost(providerMetadata),
        inputTokens: 0,
        outputTokens: 0,
      })
      await ctx.runMutation(internal.api.videos.finish, { id, storageId })
    } catch (error) {
      await ctx.runMutation(internal.api.videos.finish, {
        id,
        error: error instanceof Error ? error.message : 'Something went wrong.',
      })
    }
    return null
  },
})

export const videoMakeApi = { make }
