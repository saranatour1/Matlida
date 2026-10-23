import { zid } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'
import { internalMutation, internalQuery } from '../../_generated/server'
import {
  authedMutation,
  authedQuery,
  zAuthedMutation,
} from '../../lib/functions'
import { PHONE_NUMBER } from '../../lib/phone'
import schema from '../../schema'
import { getOwnedProject } from '../projects/queries'
import { findContacts, keyOf } from './queries'

/** Saves a contact, or updates the one with the same name. For the `save_contact` tool. */
const save = internalMutation({
  args: {
    projectId: v.id('projects'),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.id('contacts'),
  handler: async (ctx, { projectId, name, ...details }) => {
    const key = keyOf(name)
    const existing = await ctx.db
      .query('contacts')
      .withIndex('by_project_and_key', (q) =>
        q.eq('projectId', projectId).eq('key', key),
      )
      .unique()
    if (existing) {
      await ctx.db.patch('contacts', existing._id, details)
      return existing._id
    }
    return await ctx.db.insert('contacts', {
      projectId,
      name: name.trim(),
      key,
      ...details,
    })
  },
})

/** Contacts matching `name`, for the `find_contact` and `set_reminder` tools. */
const find = internalQuery({
  args: { projectId: v.id('projects'), name: v.string() },
  returns: v.array(schema.doc('contacts')),
  handler: async (ctx, { projectId, name }) =>
    await findContacts(ctx, projectId, name),
})

/** The workspace's contacts, by name. */
const list = authedQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    return await ctx.db
      .query('contacts')
      .withIndex('by_project_and_key', (q) => q.eq('projectId', projectId))
      .take(200)
  },
})

const remove = authedMutation({
  args: { id: v.id('contacts') },
  handler: async (ctx, { id }) => {
    const contact = await ctx.db.get('contacts', id)
    if (!contact) throw new ConvexError('Contact not found.')
    await getOwnedProject(ctx, ctx.userId, contact.projectId)
    await ctx.db.delete('contacts', id)
  },
})

/**
 * Adds a contact from the Contacts page, or edits one (`id`). Names stay
 * unique in a workspace, since the assistants find people by name.
 */
const put = zAuthedMutation({
  args: {
    projectId: zid('projects'),
    id: zid('contacts').optional(),
    name: z.string().trim().min(1, 'Give them a name.').max(80),
    email: z.email('That email address looks wrong.').optional(),
    phone: z
      .string()
      .regex(PHONE_NUMBER, 'Use international format, like +14155550123.')
      .optional(),
    note: z.string().trim().max(200).optional(),
  },
  handler: async (ctx, { projectId, id, name, ...details }) => {
    await getOwnedProject(ctx, ctx.userId, projectId)
    const key = keyOf(name)
    const same = await ctx.db
      .query('contacts')
      .withIndex('by_project_and_key', (q) =>
        q.eq('projectId', projectId).eq('key', key),
      )
      .unique()
    if (same && same._id !== id) {
      throw new ConvexError(`There's already a contact named ${same.name}.`)
    }
    if (!id) {
      return await ctx.db.insert('contacts', {
        projectId,
        name,
        key,
        ...details,
      })
    }
    const contact = await ctx.db.get('contacts', id)
    if (contact?.projectId !== projectId) {
      throw new ConvexError('Contact not found.')
    }
    // Cleared fields are removed, not kept.
    await ctx.db.replace('contacts', id, { projectId, name, key, ...details })
    return id
  },
})

export const contactsApi = { save, find, list, remove, put }
