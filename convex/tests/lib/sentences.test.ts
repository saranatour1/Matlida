import { describe, expect, test } from 'vitest'
import { MAX_PIECE, takePieces } from '../../lib/sentences'

/** Streams `text` in small deltas the way the model does, and returns every piece in order. */
const stream = (text: string, delta = 7) => {
  const out: Array<string> = []
  let buffer = ''
  for (let i = 0; i < text.length; i += delta) {
    buffer += text.slice(i, i + delta)
    const { pieces, rest } = takePieces(buffer, {
      first: out.length === 0,
      final: false,
    })
    out.push(...pieces)
    buffer = rest
  }
  out.push(
    ...takePieces(buffer, { first: out.length === 0, final: true }).pieces,
  )
  return out
}

describe('takePieces', () => {
  test('the first piece is ready as soon as the first sentence ends', () => {
    expect(
      takePieces('Sure! Paris is the capital', { first: true, final: false }),
    ).toEqual({ pieces: ['Sure!'], rest: 'Paris is the capital' })
  })

  test('waits while the first sentence is still going', () => {
    expect(
      takePieces('The capital of France is', { first: true, final: false }),
    ).toEqual({ pieces: [], rest: 'The capital of France is' })
  })

  test('later pieces gather short sentences into one', () => {
    expect(
      takePieces(
        'Yes. No. Maybe. Well, that depends on the weather, the time of day and how you feel. Then ',
        {
          first: false,
          final: false,
        },
      ).pieces,
    ).toEqual([
      'Yes. No. Maybe. Well, that depends on the weather, the time of day and how you feel.',
    ])
  })

  test('decimals and a sentence end with no space after it yet do not cut', () => {
    expect(
      takePieces('It costs 3.50 dollars.', { first: true, final: false })
        .pieces,
    ).toEqual([])
  })

  test('a new line ends a piece', () => {
    expect(
      takePieces('First line\nSecond', { first: true, final: false }).pieces,
    ).toEqual(['First line'])
  })

  test('final speaks whatever is left', () => {
    expect(
      takePieces('  and that is all', { first: false, final: true }),
    ).toEqual({ pieces: ['and that is all'], rest: '' })
  })

  test('a long run with no sentence end is cut at a comma', () => {
    const run = `${'word '.repeat(30)}then a comma, ${'more '.repeat(40)}`
    const { pieces } = takePieces(run, { first: true, final: false })
    expect(pieces[0]?.endsWith('comma,')).toBe(true)
    expect(pieces[0]?.length).toBeLessThanOrEqual(MAX_PIECE)
  })

  test('streaming keeps every word, in order, starting with a short first piece', () => {
    const reply =
      'Sure. The capital of France is Paris, which sits on the Seine. It has about two million people in the city itself, and many more around it. Want to know more?'
    const pieces = stream(reply)
    expect(pieces[0]).toBe('Sure.')
    expect(pieces.join(' ')).toBe(reply)
    expect(pieces.length).toBeGreaterThan(1)
  })
})
