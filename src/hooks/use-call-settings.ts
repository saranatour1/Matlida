import * as React from 'react'

/** Call settings kept on this browser: the volume, Fast voice, the voice, the speed and the language. */
const VOLUME = 'matilda:call-volume'
const FAST = 'matilda:fast-voice'
const VOICE = 'matilda:call-voice'
const AUDIO_VOICE = 'matilda:call-audio-voice'
const SPEED = 'matilda:call-speed'
const LANGUAGE = 'matilda:call-language'

/** How fast replies play. 1 is as spoken. */
export const SPEEDS = [0.75, 1, 1.25, 1.5] as const

/** Up to 150%, since spoken replies can come out quiet. */
export const MAX_VOLUME = 1.5

const listeners = new Set<() => void>()

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not saved, but it still applies until the page closes.
  }
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

export const clampVolume = (volume: number) => {
  return Math.round(Math.min(Math.max(volume, 0), MAX_VOLUME) * 100) / 100
}

/** The call volume saved on this browser, 1 when there's none or storage is blocked. */
export const getCallVolume = () => {
  const saved = read(VOLUME)
  const volume = saved === null ? 1 : Number(saved)
  return Number.isFinite(volume) ? clampVolume(volume) : 1
}

export const saveCallVolume = (volume: number) => {
  save(VOLUME, String(clampVolume(volume)))
}

/** The call volume, 0 to 1.5, kept in step across tabs. */
export const useCallVolume = () => {
  return React.useSyncExternalStore(subscribe, getCallVolume, () => 1)
}

/** Whether calls use Fast voice: an audio chat model, quicker but without tools. */
export const getFastVoice = () => {
  return read(FAST) === 'on'
}

export const saveFastVoice = (on: boolean) => {
  save(FAST, on ? 'on' : 'off')
}

export const useFastVoice = () => {
  return React.useSyncExternalStore(subscribe, getFastVoice, () => false)
}

/** The call's voice: a Kokoro voice id, or '' for the assistant's own. */
export const getCallVoice = () => read(VOICE) ?? ''
export const saveCallVoice = (voice: string) => save(VOICE, voice)
export const useCallVoice = () =>
  React.useSyncExternalStore(subscribe, getCallVoice, () => '')

/** The same for Fast voice, which has its own voices. */
export const getCallAudioVoice = () => read(AUDIO_VOICE) ?? ''
export const saveCallAudioVoice = (voice: string) => save(AUDIO_VOICE, voice)
export const useCallAudioVoice = () =>
  React.useSyncExternalStore(subscribe, getCallAudioVoice, () => '')

/** How fast replies play, one of `SPEEDS`. 1 when unset or storage is blocked. */
export const getCallSpeed = (): (typeof SPEEDS)[number] => {
  const speed = Number(read(SPEED))
  return SPEEDS.find((s) => s === speed) ?? 1
}
export const saveCallSpeed = (speed: number) => save(SPEED, String(speed))
export const useCallSpeed = () =>
  React.useSyncExternalStore(subscribe, getCallSpeed, () => 1 as const)

/** The language to hear and speak, as an ISO 639-1 code, or '' for whatever you speak. */
export const getCallLanguage = () => read(LANGUAGE) ?? ''
export const saveCallLanguage = (language: string) => save(LANGUAGE, language)
export const useCallLanguage = () =>
  React.useSyncExternalStore(subscribe, getCallLanguage, () => '')
