import { useQuery } from 'convex/react'
import { api } from '~/lib/api'

/** The sign-in methods this deployment offers (AUTH_METHODS), or undefined while it loads. */
export const useSignInMethods = () => useQuery(api.users.signInMethods)
