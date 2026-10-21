import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** A voice note's audio: what you said, or the spoken reply, on its chat message. */
export const voiceClipsTable = defineTable({
  threadId: v.string(),
  /** The chat message it plays with. */
  messageId: v.string(),
  storageId: v.id('_storage'),
}).index('by_threadId', ['threadId'])
