import { clearProfile, getProfileId, identify, track } from '@databuddy/sdk'
import { BUILT_IN_COMMANDS } from '@convex/lib/commands'

/** How someone signs in. */
export type SignInMethod = 'email' | 'google' | 'github'

/**
 * Every custom event Matilda sends to Databuddy, with its properties. Names
 * are snake_case and past tense; properties stay low-cardinality, with no
 * text, emails, names or ids. Page views, sessions, clicks, web vitals and
 * errors are tracked by `<Databuddy>` itself.
 */
type Events = {
  sign_in_started: { method: SignInMethod }
  signed_in: { method: SignInMethod | 'returning' }
  signed_up: { method: SignInMethod }
  message_sent: {
    assistant: 'lead' | 'bot'
    model: string
    effort: string
    /** A built-in command's name, `custom` for one of yours, or `none`. */
    command: string
    attachments: number
  }
  message_redone: { edited: boolean }
  model_changed: { model: string; assistant: 'lead' | 'bot' }
  effort_changed: { effort: string; assistant: 'lead' | 'bot' }
  talk_started: { assistant: 'lead' | 'bot' }
  ring_answered: { kind: 'reminder' | 'check_in' }
  ring_snoozed: { kind: 'reminder' | 'check_in' }
  ring_declined: { kind: 'reminder' | 'check_in' }
  command_pill_clicked: { command: string }
  task_answered: { started: boolean }
  task_retried: Record<string, never>
}

export const trackEvent = <TName extends keyof Events>(
  name: TName,
  properties: Events[TName],
) => {
  track(name, properties)
}

const builtIn = new Set<string>(BUILT_IN_COMMANDS.map((c) => c.name))

/** The command a message runs, as an analytics value: built-ins by name, anything of yours as `custom`. */
export const commandOf = (prompt: string) => {
  const name = /^\/([a-z0-9-]+)/i.exec(prompt.trim())?.[1]?.toLowerCase()
  if (!name) return 'none'
  return builtIn.has(name) ? name : 'custom'
}

/**
 * Ties this browser's sessions to `userId` (the Convex id, no email or
 * name), once: it's kept across reloads, so a repeat call does nothing.
 * Returns whether it identified someone new here.
 */
export const identifyUser = (userId: string) => {
  if (getProfileId() === userId) return false
  identify(userId)
  return true
}

/** Forgets the identified user, for sign-out. */
export const forgetUser = () => clearProfile()
