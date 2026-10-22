import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'

/** The sign-in methods this deployment offers (AUTH_METHODS), or undefined while it loads. */
export const useSignInMethods = () => useQuery(api.api.users.signInMethods)
