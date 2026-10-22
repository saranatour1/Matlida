import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** Where a phone call is. The last four are how it ended. */
export const phoneStatus = literals(
  'dialing',
  'ringing',
  'answered',
  'ended',
  'busy',
  'no_answer',
  'failed',
)

/** A voice call with one assistant. It started at `_creationTime`. */
export const callsTable = defineTable({
  projectId: v.id('projects'),
  /** Unset means the project's lead. */
  botId: v.optional(v.id('bots')),
  /** The chat the call's turns land in, once there is one. */
  threadId: v.optional(v.string()),
  endedAt: v.optional(v.number()),
  /** Set on a phone call an assistant placed through Photon. On its lines, `you` is the person called. */
  phone: v.optional(
    v.object({
      to: v.string(),
      status: phoneStatus,
      /** Why it failed, or how it ended. */
      note: v.optional(v.string()),
      /** Audio packets that came back. 0 on an answered call means their side never reached us. */
      heard: v.optional(v.number()),
    }),
  ),
}).index('by_project_and_bot', ['projectId', 'botId'])

/** One thing said on a call, in order. */
export const callLinesTable = defineTable({
  callId: v.id('calls'),
  who: literals('you', 'them'),
  text: v.string(),
  /** For a reply: how long it took, from hearing you to the reply being ready to play. */
  ms: v.optional(v.number()),
  /** For a reply: how long until its first words were ready to play. */
  firstMs: v.optional(v.number()),
  /** For a reply: you talked over it before it finished. */
  cutOff: v.optional(v.boolean()),
}).index('by_call', ['callId'])

/**
 * A call turn while it happens: what you said, then the reply's pieces as
 * each is voiced, so the browser can play them as they come. Deleted after
 * 10 minutes, with the audio.
 */
export const liveTurnsTable = defineTable({
  userId: v.id('users'),
  /** Made by the browser, so it can watch the turn before it starts. */
  key: v.string(),
  heard: v.optional(v.string()),
  pieces: v.array(
    v.object({
      text: v.string(),
      url: v.string(),
      storageId: v.id('_storage'),
    }),
  ),
  done: v.boolean(),
}).index('by_key', ['key'])
