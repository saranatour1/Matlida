import { expect, test } from 'vitest'
import { encodeWav } from '../lib/wav'

test('samples become a 16-bit mono WAV, clipped to range', () => {
  const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16_000)
  const view = new DataView(wav.buffer)
  const text = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4))
  expect([text(0), text(8), text(36)]).toEqual(['RIFF', 'WAVE', 'data'])
  expect(view.getUint32(24, true)).toBe(16_000)
  expect(view.getUint16(22, true)).toBe(1)
  expect(view.getUint32(40, true)).toBe(8)
  expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
    0, 32767, -32768, 32767,
  ])
})
