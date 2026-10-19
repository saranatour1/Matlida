/** Pure helpers for inbound and outbound email text. Nothing here touches a network or a database. */

/** The bare, lowercased address in `Name <user@host>` or `user@host`, or null. */
export function bareAddress(value: string) {
  const inAngles = /<([^<>]+)>/.exec(value)
  const address = (inAngles ? inAngles[1] : value).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null
}

/** The subject without any number of leading Re:, Fwd: or Fw: prefixes. */
export function stripReplyPrefix(subject: string) {
  return subject.replace(/^(\s*(re|fwd?|aw|sv)\s*:\s*)+/i, '').trim()
}

/** The subject of a reply to `subject`: adds one `Re:` if it has none. */
export function replySubject(subject: string) {
  const bare = stripReplyPrefix(subject)
  return bare ? `Re: ${bare}` : 'Re: your email'
}

/** How much of an email the assistant reads, so a long thread can't run up tokens. */
export const MAX_PROMPT_CHARS = 20_000

/**
 * The part of an email the sender wrote: quoted lines (`>`), the "On … wrote:"
 * line, signatures after `-- ` and forwarded headers are cut. Trimmed and
 * capped at `MAX_PROMPT_CHARS`.
 */
export function stripQuotes(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const kept: Array<string> = []
  for (const line of lines) {
    if (/^\s*>/.test(line)) break
    if (/^\s*On .+wrote:\s*$/.test(line)) break
    if (
      /^\s*-{2,}\s*(Original Message|Forwarded message)\s*-{2,}\s*$/i.test(line)
    ) {
      break
    }
    if (/^-- $/.test(line)) break
    if (/^(From|Sent|To|Subject):\s/.test(line) && kept.length > 0) {
      const previous = kept[kept.length - 1]
      if (previous.trim() === '') break
    }
    kept.push(line)
  }
  return kept.join('\n').trim().slice(0, MAX_PROMPT_CHARS)
}

/** The `References` header for a reply: the thread so far, then the message replied to. */
export function replyReferences(
  references: string | undefined,
  messageId: string,
) {
  const earlier = (references ?? '')
    .split(/\s+/)
    .filter((id) => id && id !== messageId)
  return [...earlier, messageId].join(' ')
}
