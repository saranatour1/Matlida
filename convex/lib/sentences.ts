/** Cutting a streamed reply into pieces to speak as soon as each one is whole. */

/** Later pieces gather sentences to at least this many characters, so speech flows with fewer, longer clips. */
export const MIN_PIECE = 80
/** A run this long with no sentence end is cut at a comma or space anyway. */
export const MAX_PIECE = 240

// ponytail: punctuation followed by whitespace ends a sentence, so "3.50" and "e.g.x" don't, but "e.g. " does.
const SENTENCE_END = /[.!?…]+["'”’)\]]*\s+|\n+/g

/**
 * The pieces of `text` ready to speak, and the rest to keep for later.
 * The `first` piece is cut at the first sentence end, so speech starts as soon
 * as possible. With `final`, everything left is a piece.
 */
export function takePieces(
  text: string,
  { first, final }: { first: boolean; final: boolean },
) {
  const pieces: Array<string> = []
  let rest = text
  for (;;) {
    const cut = nextCut(rest, pieces.length === 0 && first ? 1 : MIN_PIECE)
    if (cut === null) break
    const piece = rest.slice(0, cut).trim()
    rest = rest.slice(cut)
    if (piece) pieces.push(piece)
  }
  if (final && rest.trim()) {
    pieces.push(rest.trim())
    rest = ''
  }
  return { pieces, rest }
}

/** Where the next piece ends: the first sentence end at least `min` in, or a cut in a long run. */
function nextCut(text: string, min: number) {
  for (const match of text.matchAll(SENTENCE_END)) {
    const end = match.index + match[0].length
    if (end >= min) return end
  }
  if (text.length <= MAX_PIECE) return null
  const head = text.slice(0, MAX_PIECE)
  const comma = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '))
  const space = head.lastIndexOf(' ')
  return comma > 0 ? comma + 2 : space > 0 ? space + 1 : MAX_PIECE
}
