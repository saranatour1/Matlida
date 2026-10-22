import * as React from 'react'

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000)
  return () => clearInterval(id)
}

/** The time in whole seconds, ticking every second while mounted. */
export function useNowSeconds() {
  return React.useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000),
    () => 0,
  )
}
