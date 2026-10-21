import * as React from 'react'

const KEY = 'matilda:call-volume'

/** Up to 150%, since spoken replies can come out quiet. */
export const MAX_VOLUME = 1.5

const listeners = new Set<() => void>()

/** The call volume saved on this browser, 1 when there's none or storage is blocked. */
export function getCallVolume() {
  try {
    const saved = localStorage.getItem(KEY)
    const volume = saved === null ? 1 : Number(saved)
    return Number.isFinite(volume) ? clampVolume(volume) : 1
  } catch {
    return 1
  }
}

export function clampVolume(volume: number) {
  return Math.round(Math.min(Math.max(volume, 0), MAX_VOLUME) * 100) / 100
}

export function saveCallVolume(volume: number) {
  try {
    localStorage.setItem(KEY, String(clampVolume(volume)))
  } catch {
    // Not saved, but the call still changes volume.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

/** The call volume, 0 to 1.5, kept in step across tabs. */
export function useCallVolume() {
  return React.useSyncExternalStore(subscribe, getCallVolume, () => 1)
}
