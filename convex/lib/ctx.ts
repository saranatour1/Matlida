/** The contexts and document types, in one place. */
import type { QueryCtx } from '../_generated/server'

export type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server'
export type { Doc, Id } from '../_generated/dataModel'

/** Anything that can read the database: a query, a mutation, or a test's `t.run`. */
export type Db = Pick<QueryCtx, 'db'>
