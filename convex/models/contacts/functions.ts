import { ConvexError, v } from 'convex/values'
import { internalMutation, internalQuery } from '../../_generated/server'
import { authedMutation, authedQuery } from '../../lib/functions'
import schema from '../../schema'
import { getOwnedProject } from '../projects/functions'
import type { Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'

const keyOf = (name: string) => name.trim().toLowerCase()

/** Contacts whose name starts with `name`, ignoring case. An exact match comes first. */
export async function findContacts(
  ctx: Pick<QueryCtx, 'db'>,
  projectId: Id<'projects'>,
  name: string,
) {
  const key = keyOf(name)
  return await ctx.db
    .query('contacts')
    .withIndex('by_project_and_key', (q) =>
      q.eq('projectId', projectId).gte('key', key).lt('key', `${key}￿`),
    )
    .take(5)
}

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

export const contactsApi = { save, find, list, remove }
