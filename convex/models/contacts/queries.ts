import type { Db, Id } from '../../lib/ctx'

export const keyOf = (name: string) => name.trim().toLowerCase()

/** Contacts whose name starts with `name`, ignoring case. An exact match comes first. */
export async function findContacts(
  ctx: Db,
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
