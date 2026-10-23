import { useAuthToken } from '@convex-dev/auth/react'
import { useQuery as useTanstackQuery } from '@tanstack/react-query'
import { useQuery as useLiveQuery } from 'convex/react'
import { getFunctionName } from 'convex/server'
import { convexToJson, jsonToConvex } from 'convex/values'
import type { OptionalRestArgsOrSkip } from 'convex/react'
import type { FunctionReference, FunctionReturnType } from 'convex/server'

/**
 * `useQuery` from convex/react that shows this user's last result, kept in KV
 * by /api/snapshot, until Convex answers, so pages don't open on a spinner.
 * Shaped like convex-helpers' cached useQuery; the live result always wins.
 */
export const useQuery = <TQuery extends FunctionReference<'query'>>(
  query: TQuery,
  ...args: OptionalRestArgsOrSkip<TQuery>
): FunctionReturnType<TQuery> | undefined => {
  const live = useLiveQuery(query, ...args)
  const token = useAuthToken()
  const skip = args[0] === 'skip'
  const name = getFunctionName(query)
  const json = skip ? null : convexToJson(args[0] ?? {})
  const { data } = useTanstackQuery({
    // The token keeps one person's snapshot from showing after another signs in on this tab.
    queryKey: ['snapshot', name, json, token],
    queryFn: async () => {
      const response = await fetch('/api/snapshot', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name, args: json }),
      })
      if (!response.ok) return null
      const value = await response.json()
      return value === null ? null : jsonToConvex(value)
    },
    enabled: token !== null && !skip && live === undefined,
    staleTime: Infinity,
  })
  if (live !== undefined) return live
  return data ?? undefined
}
