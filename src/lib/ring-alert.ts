const canNotify = () => typeof Notification !== 'undefined'

/** Asks once to show notifications, so a ring reaches you on another tab. Call it from a click. */
export const askToNotify = () => {
  if (canNotify() && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
}

/**
 * Tells you an assistant is calling when you're looking elsewhere: the tab's
 * title, and a system notification if you allowed them and the tab isn't in
 * focus. Clicking the notification brings the tab back. Returns the undo.
 */
export const alertRing = (from: string) => {
  const title = document.title
  document.title = `📞 ${from} is calling`
  const notification =
    canNotify() && Notification.permission === 'granted' && !document.hasFocus()
      ? new Notification(`${from} is calling`, {
          body: 'Answer in Matilda.',
          icon: '/logo.svg',
          tag: 'ring',
          requireInteraction: true,
        })
      : null
  if (notification) {
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  }
  return () => {
    document.title = title
    notification?.close()
  }
}
