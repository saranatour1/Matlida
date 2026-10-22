import { saveMessage } from '@convex-dev/agent'
import { literals } from 'convex-helpers/validators'
import { ConvexError, v } from 'convex/values'
import { components, internal } from '../../_generated/api'
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
} from '../../_generated/server'
import { authedMutation, authedQuery } from '../../lib/functions'
import { addressOf } from '../../lib/handles'
import { rateLimiter } from '../../lib/limits'
import { photonKeys, sendEmail, sendText } from '../../lib/photon'
import schema from '../../schema'
import { getMailbox } from '../mailboxes/queries'
import { getOwnedProject } from '../projects/queries'
import { getLink } from '../texts/queries'
import { remindersTable } from './table'
import type { ActionCtx, Doc, Id, MutationCtx } from '../../lib/ctx'

const YEAR_MS = 366 * 24 * 60 * 60 * 1000
/** How long a call reminder rings before it counts as missed. */
const RING_MS = 30_000

/** Saves a reminder and schedules it. For assistants' `set_reminder` tool. */
const schedule = internalMutation({
  args: remindersTable.validator.pick(
    'projectId',
    'threadId',
    'from',
    'message',
    'dueAt',
    'via',
    'contactId',
    'toName',
    'say',
  ),
  returns: v.id('reminders'),
  handler: async (ctx, reminder) => {
    const now = Date.now()
    if (reminder.dueAt < now - 60_000) {
      throw new Error('That time has already passed.')
    }
    if (reminder.dueAt > now + YEAR_MS) {
      throw new Error('Reminders can be at most a year out.')
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
    return await ctx.db
      .query('reminders')
      .withIndex('by_project_and_status', (q) =>
        q.eq('projectId', projectId).eq('status', 'scheduled'),
      )
      .take(50)
  },
})

const cancel = authedMutation({
  args: { id: v.id('reminders') },
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (!reminder) throw new ConvexError('Reminder not found.')
    await getOwnedProject(ctx, ctx.userId, reminder.projectId)
    if (reminder.status !== 'scheduled' && reminder.status !== 'pending') return
    if (reminder.scheduledId) await ctx.scheduler.cancel(reminder.scheduledId)
    await ctx.db.patch('reminders', id, { status: 'cancelled' })
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
  await ctx.db.patch('reminders', id, { status: 'sent', note })
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
        const thread = await ctx.db
          .query('threads')
          .withIndex('by_threadId', (q) => q.eq('threadId', reminder.threadId))
          .unique()
        const bot = thread?.botId
          ? await ctx.db.get('bots', thread.botId)
          : null
        calls.push({
          _id: reminder._id,
          projectId: project._id,
          threadId: reminder.threadId,
          botId: bot?._id,
          from: reminder.from,
          portrait: (bot ?? project).portrait,
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
    const thread = await ctx.db
      .query('threads')
      .withIndex('by_threadId', (q) => q.eq('threadId', reminder.threadId))
      .unique()
    const { projectId, threadId, from, message } = reminder
    return { projectId, threadId, botId: thread?.botId, from, message }
  },
})

const decline = authedMutation({
  args: { id: v.id('reminders') },
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get('reminders', id)
    if (!reminder) throw new ConvexError('Reminder not found.')
    await getOwnedProject(ctx, ctx.userId, reminder.projectId)
    if (reminder.status === 'ringing') {
      await deliver(ctx, id, 'You declined the call.')
    }
  },
})

/** Texts a linked Telegram chat through Photon's platform API. False when Photon isn't set up. */
const textChat = async (
  chat: { spaceId: string; agentId?: string },
  text: string,
  key: string,
) => {
  const keys = photonKeys(env)
  if (!chat.agentId || !keys) return false
  await sendText(keys, {
    spaceId: chat.spaceId,
    senderId: chat.agentId,
    text,
    key,
  })
  return true
}

/** Nobody picked up: texts the reminder when texting is linked, and posts it in the chat. */
const miss = internalAction({
  args: { id: v.id('reminders') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const found = await ctx.runQuery(internal.api.reminders.delivery, {
      id,
      status: 'ringing',
    })
    if (!found) return null
    const { reminder, chat } = found
    const texted =
      chat &&
      (await textChat(
        chat,
        `Missed call from ${reminder.from}: ${reminder.message}`,
        `missed:${id}`,
      ))
    await ctx.runMutation(internal.api.reminders.markSent, {
      id,
      note:
        chat && !texted
          ? 'You missed the call, and the text about it couldn’t be sent.'
          : 'You missed the call.',
    })
    return null
  },
})

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
    if (contact) {
      await ctx.runMutation(internal.api.reminders.markSent, {
        id,
        note: await emailContact(ctx, reminder, contact, mail?.from ?? null),
      })
      return null
    }
    if (reminder.via === 'call') {
      await ctx.runMutation(internal.api.reminders.ring, { id })
      return null
    }
    let note: string | undefined
    if (reminder.via === 'email') {
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
    if (reminder.via === 'text') {
      const texted =
        chat &&
        (await textChat(
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
  miss,
}
