/** Someone a message can be addressed to with `@name`. `bot` is null for the lead. */
export type Person<TBot> = { name: string; bot: TBot | null }

/**
 * The assistant a message starting with `@name` is for, longest name first so
 * "@Ivy Lee" beats "@Ivy", and the rest of the message. Null when it doesn't
 * start with a tag or the name matches no one.
 */
export function addressee<TBot>(
  text: string,
  people: Array<Person<TBot>>,
): { bot: TBot | null; rest: string } | null {
  const sorted = [...people].sort((a, b) => b.name.length - a.name.length)
  const lower = text.toLowerCase()
  for (const person of sorted) {
    const tag = `@${person.name.toLowerCase()}`
    if (
      lower.startsWith(tag) &&
      !/[\p{L}\p{N}]/u.test(text.charAt(tag.length))
    ) {
      return {
        bot: person.bot,
        rest: text.slice(tag.length).replace(/^[\s,:]+/, ''),
      }
    }
  }
  return null
}
