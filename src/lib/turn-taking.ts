/**
 * Who talks when on a call, decided from the microphone's loudness alone.
 * The calibration knobs are the numbers below; tune them from real calls.
 */

/** Loudness (RMS) above which the microphone counts as someone talking. */
export const SPEECH_LEVEL = 0.035
/** Louder bar while the assistant talks, so its own voice leaking into the mic doesn't count. */
export const OVER_REPLY_LEVEL = 0.05
/** Talking over the assistant this long pauses it. Shorter is a cough. */
export const PAUSE_AFTER_MS = 250
/** Talking over it for less than this, then going quiet, lets it carry on: an "mm-hm". */
export const BACKCHANNEL_MS = 700
/** Quiet this long after an "mm-hm" resumes the assistant. */
export const RESUME_AFTER_MS = 600
/** Quiet this long after talking ends your turn. People pause mid-sentence for less. */
export const END_SILENCE_MS = 1200
export const MAX_TURN_MS = 30_000
/** A recording with no talking restarts after this, so clips stay small. */
export const IDLE_RESTART_MS = 15_000
/** A dip shorter than this doesn't break a run of talking. */
const DIP_MS = 150

type Listening = {
  began: number
  /** Start of the current run of talking, if one is going. */
  voiceFrom: number | null
  /** When your turn's talking started, once it has. */
  heardAt: number | null
  lastVoice: number
}

export type TurnEvent =
  | 'none'
  /** You started talking. */
  | 'hearing'
  /** You're talking over the assistant: pause its reply. */
  | 'pause'
  /** That was only an "mm-hm": drop the clip and resume the reply. */
  | 'resume'
  /** Your turn is done: send the clip, dropping any paused reply. */
  | 'send'
  /** Nothing was said: start a fresh recording. */
  | 'restart'

export const startListening = (now: number): Listening => {
  return { began: now, voiceFrom: null, heardAt: null, lastVoice: now }
}

/** One microphone sample. `replying` is the assistant audibly talking; `paused` is its reply on hold for you. */
export const hear = (
  state: Listening,
  {
    level,
    now,
    replying,
    paused,
  }: { level: number; now: number; replying: boolean; paused: boolean },
): { next: Listening; event: TurnEvent } => {
  const { heardAt } = state
  let { voiceFrom, lastVoice } = state
  if (level > (replying ? OVER_REPLY_LEVEL : SPEECH_LEVEL)) {
    voiceFrom ??= now
    lastVoice = now
  } else if (voiceFrom !== null && now - lastVoice > DIP_MS) {
    voiceFrom = null
  }
  const next = { ...state, voiceFrom, heardAt, lastVoice }

  if (heardAt === null && voiceFrom !== null) {
    if (!replying)
      return { next: { ...next, heardAt: voiceFrom }, event: 'hearing' }
    if (now - voiceFrom >= PAUSE_AFTER_MS) {
      return { next: { ...next, heardAt: voiceFrom }, event: 'pause' }
    }
  }
  if (heardAt !== null) {
    const quiet = now - lastVoice
    if (
      paused &&
      lastVoice - heardAt < BACKCHANNEL_MS &&
      quiet > RESUME_AFTER_MS
    ) {
      return { next, event: 'resume' }
    }
    if (quiet > END_SILENCE_MS || now - heardAt > MAX_TURN_MS) {
      return { next, event: 'send' }
    }
  }
  if (heardAt === null && !replying && now - state.began > IDLE_RESTART_MS) {
    return { next, event: 'restart' }
  }
  return { next, event: 'none' }
}
