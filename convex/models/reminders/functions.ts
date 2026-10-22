import { saveMessage } from '@convex-dev/agent'
import { Crons } from '@convex-dev/crons'
import { DateTime } from 'luxon'
import { literals } from 'convex-helpers/validators'
import { ConvexError, v } from 'convex/values'
import { components, internal } from '../../_generated/api'
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import { decisionModel } from '../../lib/ai'
import { metered } from '../../lib/budget'
import { afterMissedCall, checkRecurring, recentTurns } from '../../lib/decide'
import { authedMutation, authedQuery } from '../../lib/functions'
import { addressOf } from '../../lib/handles'
import { rateLimiter } from '../../lib/limits'
import { MODELS } from '../../lib/models'
import { photonKeys, sendEmail, sendText } from '../../lib/photon'
import schema from '../../schema'
import { getMailbox } from '../mailboxes/queries'
import { getOwnedProject } from '../projects/queries'
import { getLink } from '../texts/queries'
import { assistantOf } from '../threads/queries'
import { spectrum } from '../texts/spectrum'
import { remindersTable } from './table'
import type { AfterMissed, HowOften } from '../../lib/decide'
import type { ActionCtx, Doc, Id, MutationCtx } from '../../lib/ctx'

const YEAR_MS = 366 * 24 * 60 * 60 * 1000
/** How long a call reminder rings before it counts as missed. */
const RING_MS = 30_000
/** Snooze on a ringing call rings again this much later. */
const SNOOZE_MS = 10 * 60_000
/** Missed calls before the assistant stops calling about a reminder. */
const MAX_CALLS = 3
const AGAIN_MS = { call_again_soon: 10 * 60_000, call_again_later: 60 * 60_000 }

/** `at` in `timeZone`, or in UTC when the zone isn't one luxon knows. */
const zoned = (at: number, timeZone = 'UTC') => {
  const time = DateTime.fromMillis(at, { zone: timeZone })
  return time.isValid ? time : DateTime.fromMillis(at, { zone: 'UTC' })
}

/** `at`, or 9am after it when it falls outside 9am–9pm in `timeZone`. */
export const inDaytime = (at: number, timeZone?: string) => {
  const time = zoned(at, timeZone)
  if (time.hour >= 9 && time.hour < 21) return at
  const nine = time.set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
  return (time.hour < 9 ? nine : nine.plus({ days: 1 })).toMillis()
}

const localTime = (at: number, timeZone?: string) =>
  zoned(at, timeZone).toFormat('cccc h:mm a')

/** The cron spec for a reminder that recurs `every`, at `dueAt`'s time of day in `timeZone`. */
export const cronFor = (
  every: Exclude<HowOften, 'once' | 'custom'>,
  dueAt: number,
  timeZone?: string,
) => {
  const { minute, hour, weekday, day } = zoned(dueAt, timeZone)
  return {
    daily: `${minute} ${hour} * * *`,
    weekdays: `${minute} ${hour} * * 1-5`,
    weekly: `${minute} ${hour} * * ${weekday}`,
    monthly: `${minute} ${hour} ${day} * *`,
  }[every]
}

/** Five or six cron fields. The crons component checks the rest when it registers. */
const CRON_SPEC = /^(\S+\s+){4,5}\S+$/

const recurring = new Crons(components.crons)
const cronName = (id: Id<'reminders'>) => `reminder:${id}`

/** Registers a recurring reminder's cron, in the owner's time zone. */
const register = async (
  ctx: MutationCtx,
  id: Id<'reminders'>,
  cronspec: string,
  timeZone?: string,
) => {
  await recurring.register(
    ctx,
    { kind: 'cron', cronspec, tz: zoned(0, timeZone).zoneName ?? 'UTC' },
    internal.api.reminders.fire,
    { id },
    cronName(id),
  )
}

const unregister = async (ctx: MutationCtx, id: Id<'reminders'>) => {
  if (await recurring.get(ctx, { name: cronName(id) })) {
    await recurring.delete(ctx, { name: cronName(id) })
  }
}

/** Saves a reminder and schedules it. For assistants' `set_reminder` tool. */
const schedule = internalMutation({
  args: remindersTable.validator
    .pick(
      'projectId',
      'threadId',
      'from',
      'message',
      'dueAt',
      'via',
      'contactId',
      'toName',
      'say',
    )
    .extend({
      /** Unset or `once` for a one-off. `custom` takes `cron`. */
      every: v.optional(
        literals('once', 'daily', 'weekdays', 'weekly', 'monthly', 'custom'),
      ),
      cron: v.optional(v.string()),
    }),
  returns: v.id('reminders'),
  handler: async (ctx, { every = 'once', cron, ...reminder }) => {
    const now = Date.now()
    if (reminder.dueAt < now - 60_000) {
      throw new Error('That time has already passed.')
    }
    if (reminder.dueAt > now + YEAR_MS) {
      throw new Error('Reminders can be at most a year out.')
    }
    if (every !== 'once') {
      if (reminder.contactId) {
        throw new Error("Recurring messages to contacts aren't supported yet.")
      }
      const project = await ctx.db.get('projects', reminder.projectId)
      const owner = project && (await ctx.db.get('users', project.ownerId))
      const cronspec =
        every === 'custom'
          ? cron?.trim()
          : cronFor(every, reminder.dueAt, owner?.timeZone)
      if (!cronspec || !CRON_SPEC.test(cronspec)) {
        throw new Error(
          'A custom repeat needs `cron`: five cron fields, like "0 9 * * 2,4".',
        )
      }
      const id = await ctx.db.insert('reminders', {
        ...reminder,
        status: 'scheduled',
        repeat: { every, cronspec },
      })
      await register(ctx, id, cronspec, owner?.timeZone)
      return id
    }
    // A message to someone else waits for the owner's OK in the chat.
    if (reminder.contactId) {
      return await ctx.db.insert('reminders', {
        ...reminder,
        status: 'pending',
      })
    }
    const id = await ctx.db.insert('reminders', {
      ...reminder,
      status: 'scheduled',
    })
    await start(ctx, id, reminder.dueAt)
    return id
  },
})

const start = async (ctx: MutationCtx, id: Id<'reminders'>, dueAt: number) => {
  const scheduledId = await ctx.scheduler.runAt(
    dueAt,
    internal.api.reminders.fire,
    { id },
  )
  await ctx.db.patch('reminders', id, { status: 'scheduled', scheduledId })
}

/** The owner's OK for a message to a contact. Sends it when due, or now if that's passed. */
const confirm = authedMutation({
  args: { id: v.id('reminders') },
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (!reminder) throw new ConvexError('Reminder not found.')
    await getOwnedProject(ctx, ctx.userId, reminder.projectId)
    if (reminder.status !== 'pending') return
    await start(ctx, id, Math.max(reminder.dueAt, Date.now()))
  },
})

/** A reminder's status, for its card in the chat. */
const state = authedQuery({
  args: { id: v.id('reminders') },
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (!reminder) return null
    await getOwnedProject(ctx, ctx.userId, reminder.projectId)
    return reminder.status
  },
})

/** Upcoming reminders, soonest first. */
const list = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    const [scheduled, paused] = await Promise.all(
      (['scheduled', 'paused'] as const).map((status) =>
        ctx.db
          .query('reminders')
          .withIndex('by_project_and_status', (q) =>
            q.eq('projectId', projectId).eq('status', status),
          )
          .take(50),
      ),
    )
    return [...scheduled, ...paused]
  },
})

const cancel = authedMutation({
  args: { id: v.id('reminders') },
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (!reminder) throw new ConvexError('Reminder not found.')
    await getOwnedProject(ctx, ctx.userId, reminder.projectId)
    if (!['scheduled', 'pending', 'paused'].includes(reminder.status)) return
    if (reminder.scheduledId) await ctx.scheduler.cancel(reminder.scheduledId)
    if (reminder.repeat) await unregister(ctx, id)
    await ctx.db.patch('reminders', id, { status: 'cancelled' })
  },
})

/** Pauses a recurring reminder: its cron goes until `resume`. */
const pause = authedMutation({
  args: { id: v.id('reminders') },
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (!reminder) throw new ConvexError('Reminder not found.')
    await getOwnedProject(ctx, ctx.userId, reminder.projectId)
    if (reminder.repeat && reminder.status === 'scheduled') {
      await unregister(ctx, id)
      await ctx.db.patch('reminders', id, { status: 'paused' })
    }
  },
})

const resume = authedMutation({
  args: { id: v.id('reminders') },
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (!reminder) throw new ConvexError('Reminder not found.')
    await getOwnedProject(ctx, ctx.userId, reminder.projectId)
    if (!reminder.repeat || reminder.status !== 'paused') return
    const user = await ctx.db.get('users', ctx.userId)
    await register(ctx, id, reminder.repeat.cronspec, user?.timeZone)
    await ctx.db.patch('reminders', id, { status: 'scheduled' })
  },
})

/** Jev's call on a recurring reminder: stop or pause it, and say why in the chat. */
const settle = internalMutation({
  args: {
    id: v.id('reminders'),
    status: literals('paused', 'cancelled'),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { id, status, note }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (reminder?.status !== 'scheduled') return null
    await unregister(ctx, id)
    await ctx.db.patch('reminders', id, { status, note })
    await saveMessage(ctx, components.agent, {
      threadId: reminder.threadId,
      message: { role: 'assistant', content: `⏰ _${note}_` },
    })
    return null
  },
})

const delivery = internalQuery({
  args: { id: v.id('reminders'), status: literals('scheduled', 'ringing') },
  returns: v.union(
    v.object({
      reminder: schema.doc('reminders'),
      /** The linked chat a text reminder goes to, and Photon's agent there when it's linked through Photon's API. */
      chat: v.union(
        v.object({ spaceId: v.string(), agentId: v.optional(v.string()) }),
        v.null(),
      ),
      /** Where an email reminder goes and comes from, once the owner has an address. */
      mail: v.union(v.object({ to: v.string(), from: v.string() }), v.null()),
      /** For a message to a contact: their email, and the owner's name to sign it with. */
      contact: v.union(
        v.object({ email: v.union(v.string(), v.null()), owner: v.string() }),
        v.null(),
      ),
      ownerId: v.id('users'),
      timeZone: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, { id, status }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (reminder?.status !== status) return null
    const project = await ctx.db.get('projects', reminder.projectId)
    if (!project) return null
    const link = await getLink(ctx, project._id)
    const owner = await ctx.db.get('users', project.ownerId)
    const mailbox = await getMailbox(ctx, project.ownerId)
    const mail =
      owner?.email && mailbox && env.MAIL_DOMAIN
        ? { to: owner.email, from: addressOf(mailbox.handle, env.MAIL_DOMAIN) }
        : null
    const contact = reminder.contactId
      ? await ctx.db.get('contacts', reminder.contactId)
      : null
    return {
      reminder,
      contact: reminder.contactId
        ? {
            email: contact?.email ?? null,
            owner: owner?.name ?? owner?.email ?? 'your contact',
          }
        : null,
      chat:
        link?.status === 'linked'
          ? { spaceId: link.spaceId, agentId: link.agentId }
          : null,
      mail,
      ownerId: project.ownerId,
      timeZone: owner?.timeZone,
    }
  },
})

/**
 * Marks a scheduled or ringing reminder sent and posts it in its chat.
 * Returns it, or null when it was already delivered, so retries post once.
 */
const deliver = async (
  ctx: MutationCtx,
  id: Id<'reminders'>,
  note?: string,
) => {
  const reminder = await ctx.db.get('reminders', id)
  if (reminder?.status !== 'scheduled' && reminder?.status !== 'ringing') {
    return null
  }
  // A recurring reminder waits for its next time, with a fresh count of calls.
  await ctx.db.patch('reminders', id, {
    status: reminder.repeat ? 'scheduled' : 'sent',
    note,
    ...(reminder.repeat && { attempts: undefined }),
  })
  const content = reminder.contactId
    ? `📨 **To ${reminder.toName ?? 'your contact'}:** ${reminder.say ?? reminder.message}`
    : `⏰ **Reminder:** ${reminder.message}`
  await saveMessage(ctx, components.agent, {
    threadId: reminder.threadId,
    message: {
      role: 'assistant',
      content: `${content}${note ? `\n\n_${note}_` : ''}`,
    },
  })
  return reminder
}

const markSent = internalMutation({
  args: { id: v.id('reminders'), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, note }) => {
    await deliver(ctx, id, note)
    return null
  },
})

/** Starts ringing a due call reminder, and gives up after `RING_MS`. */
const ring = internalMutation({
  args: { id: v.id('reminders') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (reminder?.status !== 'scheduled') return null
    await ctx.db.patch('reminders', id, { status: 'ringing' })
    await ctx.scheduler.runAfter(RING_MS, internal.api.reminders.miss, { id })
    return null
  },
})

/** Call reminders ringing now, across your projects, with who is calling. */
const ringing = authedQuery({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_owner', (q) => q.eq('ownerId', ctx.userId))
      .take(50)
    const calls = []
    for (const project of projects) {
      const rings = await ctx.db
        .query('reminders')
        .withIndex('by_project_and_status', (q) =>
          q.eq('projectId', project._id).eq('status', 'ringing'),
        )
        .take(5)
      for (const reminder of rings) {
        const bot = (await assistantOf(ctx, reminder.threadId))?.bot ?? null
        calls.push({
          _id: reminder._id,
          projectId: project._id,
          threadId: reminder.threadId,
          botId: bot?._id,
          from: reminder.from,
          portrait: (bot ?? project).portrait,
          again: (reminder.attempts ?? 0) > 0,
        })
      }
    }
    return calls
  },
})

/** Picks up a ringing call reminder for `calls.answer`. Null when it stopped ringing. */
const pickUp = internalMutation({
  args: { id: v.id('reminders'), userId: v.id('users') },
  returns: v.union(
    v.object({
      projectId: v.id('projects'),
      threadId: v.string(),
      botId: v.optional(v.id('bots')),
      from: v.string(),
      message: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { id, userId }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (!reminder) throw new ConvexError('Reminder not found.')
    await getOwnedProject(ctx, userId, reminder.projectId)
    if (reminder.status !== 'ringing') return null
    await deliver(ctx, id, 'You picked up.')
    const bot = (await assistantOf(ctx, reminder.threadId))?.bot
    const { projectId, threadId, from, message } = reminder
    return { projectId, threadId, botId: bot?._id, from, message }
  },
})

const decline = authedMutation({
  args: { id: v.id('reminders') },
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (!reminder) throw new ConvexError('Reminder not found.')
    await getOwnedProject(ctx, ctx.userId, reminder.projectId)
    if (reminder.status !== 'ringing') return
    // Out of `ringing` so it stops; `miss` decides what's next.
    await ctx.db.patch('reminders', id, {
      status: 'scheduled',
      scheduledId: undefined,
    })
    await ctx.scheduler.runAfter(0, internal.api.reminders.miss, {
      id,
      declined: true,
    })
  },
})

/** Rings a ringing call again in `SNOOZE_MS`. */
const snooze = authedMutation({
  args: { id: v.id('reminders') },
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (!reminder) throw new ConvexError('Reminder not found.')
    await getOwnedProject(ctx, ctx.userId, reminder.projectId)
    if (reminder.status !== 'ringing') return
    await start(ctx, id, Date.now() + SNOOZE_MS)
  },
})

/** Schedules another call at `at`, and says so in the chat. */
const callAgain = internalMutation({
  args: {
    id: v.id('reminders'),
    status: literals('scheduled', 'ringing'),
    at: v.number(),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { id, status, at, note }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (reminder?.status !== status) return null
    await ctx.db.patch('reminders', id, {
      attempts: (reminder.attempts ?? 0) + 1,
    })
    await start(ctx, id, at)
    await saveMessage(ctx, components.agent, {
      threadId: reminder.threadId,
      message: { role: 'assistant', content: `📞 _${note}_` },
    })
    return null
  },
})

/**
 * Texts a linked chat: through Photon's platform API when the chat was
 * linked there, otherwise through the Spectrum SDK's outbox. Always sent.
 */
const textChat = async (
  ctx: ActionCtx,
  chat: { spaceId: string; agentId?: string },
  text: string,
  key: string,
) => {
  const keys = photonKeys(env)
  if (chat.agentId && keys) {
    await sendText(keys, {
      spaceId: chat.spaceId,
      senderId: chat.agentId,
      text,
      key,
    })
    return true
  }
  await spectrum.send(ctx, {
    spaceId: chat.spaceId,
    content: { type: 'text', text },
  })
  return true
}

/**
 * Nobody picked up, or you declined: Jev decides whether to call again soon,
 * later, text it, or leave it in the chat. Code keeps to `MAX_CALLS`, your
 * 9am–9pm, and texting only when it's linked. Jev failing leaves it in the chat.
 */
const miss = internalAction({
  args: { id: v.id('reminders'), declined: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { id, declined = false }) => {
    const status = declined ? 'scheduled' : 'ringing'
    const found = await ctx.runQuery(internal.api.reminders.delivery, {
      id,
      status,
    })
    if (!found) return null
    const { reminder, chat, ownerId, timeZone } = found
    const attempts = (reminder.attempts ?? 0) + 1
    const next: AfterMissed =
      attempts >= MAX_CALLS
        ? 'text_instead'
        : await nextAfterMiss(ctx, reminder, {
            ownerId,
            attempts,
            declined,
            timeZone,
          })
    const missed = declined ? 'You declined the call.' : 'You missed the call.'
    if (next === 'call_again_soon' || next === 'call_again_later') {
      const at = inDaytime(Date.now() + AGAIN_MS[next], timeZone)
      const when = zoned(at, timeZone).toFormat('h:mm a')
      await ctx.runMutation(internal.api.reminders.callAgain, {
        id,
        status,
        at,
        note: `${missed} ${reminder.from} will call again at ${when}: ${reminder.message}`,
      })
      return null
    }
    const texted =
      next === 'text_instead' &&
      chat &&
      (await textChat(
        ctx,
        chat,
        `Missed call from ${reminder.from}: ${reminder.message}`,
        `missed:${id}`,
      ))
    await ctx.runMutation(internal.api.reminders.markSent, {
      id,
      note: texted ? `${missed} It was texted to you too.` : missed,
    })
    return null
  },
})

const nextAfterMiss = async (
  ctx: ActionCtx,
  reminder: Doc<'reminders'>,
  {
    ownerId,
    attempts,
    declined,
    timeZone,
  }: {
    ownerId: Id<'users'>
    attempts: number
    declined: boolean
    timeZone?: string
  },
): Promise<AfterMissed> => {
  try {
    const conversation = (await recentTurns(ctx, reminder.threadId)).slice(-6)
    return await metered(
      ctx,
      { userId: ownerId, model: MODELS.decide, estimate: 0.005 },
      async () => {
        const { next, cost } = await afterMissedCall(decisionModel, {
          reminder: reminder.message,
          attempts,
          declined,
          localTime: localTime(Date.now(), timeZone),
          conversation,
        })
        return { result: next, cost }
      },
    )
  } catch (error) {
    console.error(error)
    return 'leave_in_chat'
  }
}

/**
 * Emails a contact the reminder's message, from the owner's assistant address
 * and signed as an automated message. Returns a note for the chat when it
 * couldn't, or null.
 */
const emailContact = async (
  ctx: ActionCtx,
  reminder: Doc<'reminders'>,
  contact: { email: string | null; owner: string },
  from: string | null,
) => {
  const keys = photonKeys(env)
  if (!contact.email) return "There's no email for them, so it wasn't sent."
  if (!from || !keys) return "Email isn't set up, so it wasn't sent."
  const allowed: boolean = await ctx.runMutation(
    internal.api.reminders.allowContactMessage,
    { projectId: reminder.projectId },
  )
  if (!allowed) return 'Too many messages to contacts today, so it wasn’t sent.'
  try {
    await sendEmail(keys, {
      from,
      to: contact.email,
      subject: `A message from ${contact.owner}`,
      text: `${reminder.say ?? reminder.message}\n\n${reminder.from}, ${contact.owner}'s assistant. This message was sent automatically.`,
      key: `reminder:${reminder._id}`,
    })
    return undefined
  } catch (error) {
    console.error(error)
    return "The email couldn't be sent."
  }
}

/** Whether the workspace may message another contact now. */
const allowContactMessage = internalMutation({
  args: { projectId: v.id('projects') },
  returns: v.boolean(),
  handler: async (ctx, { projectId }) =>
    (await rateLimiter.limit(ctx, 'contactMessage', { key: projectId })).ok,
})

/**
 * Jev's look at a recurring reminder that's due: stops it when it's no
 * longer needed, pauses or skips it, or picks another way to reach you when
 * it's sure. Returns how to send it now, or null when it isn't sent.
 * Jev failing sends it as set.
 */
const recurringVia = async (
  ctx: ActionCtx,
  {
    reminder,
    ownerId,
    timeZone,
  }: { reminder: Doc<'reminders'>; ownerId: Id<'users'>; timeZone?: string },
) => {
  let check
  try {
    const conversation = (await recentTurns(ctx, reminder.threadId)).slice(-10)
    check = await metered(
      ctx,
      { userId: ownerId, model: MODELS.decide, estimate: 0.005 },
      async () => {
        const { cost, ...result } = await checkRecurring(decisionModel, {
          reminder: reminder.message,
          via: reminder.via,
          localTime: localTime(Date.now(), timeZone),
          conversation,
        })
        return { result, cost }
      },
    )
  } catch (error) {
    console.error(error)
    return reminder.via
  }
  if (check.stillNeeded < 0.3) {
    await ctx.runMutation(internal.api.reminders.settle, {
      id: reminder._id,
      status: 'cancelled',
      note: `I stopped reminding you to ${reminder.message}: it sounds done. Ask me to start it again anytime.`,
    })
    return null
  }
  if (check.action === 'pause') {
    await ctx.runMutation(internal.api.reminders.settle, {
      id: reminder._id,
      status: 'paused',
      note: `I paused "${reminder.message}" for now. Resume it from the Library when you want it back.`,
    })
    return null
  }
  if (check.action === 'skip_once') return null
  return check.action === 'notify_differently' &&
    check.channelProbability >= 0.7
    ? check.channel
    : reminder.via
}

/** Delivers a due reminder: a ring, a text or an email when asked for, and always a chat message. */
const fire = internalAction({
  args: { id: v.id('reminders') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const found = await ctx.runQuery(internal.api.reminders.delivery, {
      id,
      status: 'scheduled',
    })
    if (!found) return null
    const { reminder, chat, mail, contact } = found
    // Jev looks at a recurring reminder when its cron fires, not on call-agains.
    const via =
      reminder.repeat && !reminder.attempts
        ? await recurringVia(ctx, found)
        : reminder.via
    if (!via) return null
    if (contact) {
      await ctx.runMutation(internal.api.reminders.markSent, {
        id,
        note: await emailContact(ctx, reminder, contact, mail?.from ?? null),
      })
      return null
    }
    if (via === 'call') {
      await ctx.runMutation(internal.api.reminders.ring, { id })
      return null
    }
    let note: string | undefined
    if (via === 'email') {
      const keys = photonKeys(env)
      if (mail && keys) {
        try {
          await sendEmail(keys, {
            ...mail,
            subject: `Reminder: ${reminder.message.slice(0, 80)}`,
            text: `${reminder.message}\n\n${reminder.from}`,
            key: `reminder:${id}`,
          })
        } catch (error) {
          console.error(error)
          note = "The email couldn't be sent, so it's only here."
        }
      } else {
        note = "Email isn't set up, so it's only here."
      }
    }
    if (via === 'text') {
      const texted =
        chat &&
        (await textChat(
          ctx,
          chat,
          `Reminder from ${reminder.from}: ${reminder.message}`,
          `reminder:${id}`,
        ))
      if (!texted) {
        note = "Texting isn't linked, so it's only here."
      }
    }
    await ctx.runMutation(internal.api.reminders.markSent, { id, note })
    return null
  },
})

export const remindersApi = {
  schedule,
  confirm,
  state,
  list,
  cancel,
  allowContactMessage,
  delivery,
  markSent,
  fire,
  ring,
  ringing,
  pickUp,
  decline,
  pause,
  resume,
  settle,
  snooze,
  callAgain,
  miss,
}
