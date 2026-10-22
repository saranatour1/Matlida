import * as React from 'react'

/** Call settings kept on this browser: the volume, and Fast voice. */
const VOLUME = 'matilda:call-volume'
const FAST = 'matilda:fast-voice'

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
