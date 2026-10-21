import { v } from 'convex/values'
import { internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import { authedQuery } from '../../lib/functions'
import { videosTable } from './table'

const { shape: vShape } = videosTable.validator.fields

/** Past the 10-minute action limit, so a video still working by then lost its action. */
const GIVE_UP_MS = 12 * 60_000

/** The video and its file's URL, for its card. Null unless you own its workspace. */
const get = authedQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const videoId = ctx.db.normalizeId('videos', id)
    const video = videoId && (await ctx.db.get('videos', videoId))
    const project = video && (await ctx.db.get('projects', video.projectId))
    if (!video || project?.ownerId !== ctx.userId) return null
    const url = video.storageId && (await ctx.storage.getUrl(video.storageId))
    return { ...video, url: url ?? null }
  },
})

/** `generate_video`: the row its card follows, and the work, in the background. */
const start = internalMutation({
  args: {
    projectId: v.id('projects'),
    threadId: v.string(),
    prompt: v.string(),
    shape: vShape,
  },
  returns: v.id('videos'),
  handler: async (ctx, video) => {
    const id = await ctx.db.insert('videos', { ...video, status: 'working' })
    await ctx.scheduler.runAfter(0, internal.api.videoMake.make, {
      id,
      ...video,
    })
    await ctx.scheduler.runAfter(GIVE_UP_MS, internal.api.videos.finish, {
      id,
      error: 'It took too long. Try again.',
    })
    return id
  },
})

/**
 * How it went. A file always lands, even after the give-up said it failed;
 * an error only lands while it's still working. Safe to run again.
 */
const finish = internalMutation({
  args: {
    id: v.id('videos'),
    storageId: v.optional(v.id('_storage')),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, storageId, error }) => {
    const video = await ctx.db.get('videos', id)
    if (!video || video.status === 'done') return null
    if (storageId) {
      await ctx.db.patch('videos', id, {
        status: 'done',
        storageId,
        error: undefined,
      })
    } else if (video.status === 'working') {
      await ctx.db.patch('videos', id, {
        status: 'failed',
        error: (error ?? 'Something went wrong.').slice(0, 300),
      })
    }
    return null
  },
})

export const videosApi = { get, start, finish }
