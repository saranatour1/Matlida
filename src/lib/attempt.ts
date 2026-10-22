import { toast } from 'sonner'
import { errorMessage } from '~/lib/errors'

/**
 * Runs what a click started (a mutation, an action) and shows a failure as
 * a toast instead of losing it as an unhandled rejection.
 */
export const attempt = async (
  work: Promise<unknown>,
  fallback = 'That didn’t work. Try again.',
) => {
  try {
    await work
  } catch (error) {
    console.error(error)
    toast.error(errorMessage(error, fallback))
  }
}
