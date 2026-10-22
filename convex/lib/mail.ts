/** How much of an email the assistant reads, so a long thread can't run up tokens. */
export const MAX_PROMPT_CHARS = 20_000

/**
 * The part of an email the sender wrote: quoted lines (`>`), the "On … wrote:"
 * line, signatures after `-- ` and forwarded headers are cut. Trimmed and
 * capped at `MAX_PROMPT_CHARS`.
 */
export const stripQuotes = (text: string) => {
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
