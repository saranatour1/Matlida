import { expect, test } from 'vitest'
import {
  FRAME,
  downsampler,
  fromMuLaw,
  listener,
  readRtp,
  recorder,
  rtpPacket,
  toMuLaw,
} from '../../lib/rtp'

test('µ-law matches G.711 and round-trips within its steps', () => {
  expect(toMuLaw(0)).toBe(0xff)
  expect(fromMuLaw(0xff)).toBe(0)
  expect(toMuLaw(32767)).toBe(0x80)
  expect(fromMuLaw(0x00)).toBe(-32124)
  for (const sample of [-30000, -1000, -50, 50, 1000, 30000]) {
    const back = fromMuLaw(toMuLaw(sample))
    expect(Math.abs(back - sample)).toBeLessThanOrEqual(
      Math.abs(sample) * 0.07 + 8,
    )
  }
})

test('24 kHz PCM in uneven chunks becomes 8 kHz µ-law', () => {
  const pcm = new Uint8Array(24_000 * 2)
  const view = new DataView(pcm.buffer)
  for (let i = 0; i < pcm.length / 2; i++) view.setInt16(i * 2, 1000, true)
  const toPhone = downsampler()
  const out = [pcm.subarray(0, 7), pcm.subarray(7, 1001), pcm.subarray(1001)]
    .map(toPhone)
    .reduce((n, chunk) => n + chunk.length, 0)
  expect(out).toBe(8000)
  expect(fromMuLaw(toPhone(pcm.subarray(0, 6))[0])).toBeCloseTo(1000, -2)
})

test('an RTP packet reads back as its audio, and only PCMU', () => {
  const payload = new Uint8Array(FRAME).fill(toMuLaw(500))
  const packet = rtpPacket({
    seq: 70_000,
    timestamp: 2 ** 33,
    ssrc: 42,
    marker: true,
    payload,
  })
  expect(packet[1]).toBe(0x80)
  const samples = readRtp(packet)
  expect(samples).toHaveLength(FRAME)
  expect(samples?.[0]).toBe(fromMuLaw(toMuLaw(500)))
  const dtmf = packet.slice()
  dtmf[1] = 101
  expect(readRtp(dtmf)).toBeNull()
  expect(readRtp(new Uint8Array(20))).toBeNull()
})

test('the listener hears speech, then a pause, and ignores quiet', () => {
  const ear = listener()
  const quiet = new Int16Array(FRAME)
  const loud = new Int16Array(FRAME).fill(3000)
  for (let i = 0; i < 100; i++) expect(ear.push(quiet)).toBeNull()
  for (let i = 0; i < 30; i++) expect(ear.push(loud)).toBeNull()
  for (let i = 0; i < 34; i++) expect(ear.push(quiet)).toBeNull()
  const said = ear.push(quiet)
  // 10 frames before it, 30 loud, 35 quiet.
  expect(said).toHaveLength((10 + 30 + 35) * FRAME)
  // A click (two loud frames) isn't speech.
  ear.push(loud)
  ear.push(loud)
  for (let i = 0; i < 50; i++) expect(ear.push(quiet)).toBeNull()
})

test('the recording mixes both sides, a frame at a time', () => {
  const tape = recorder()
  tape.hear(new Int16Array(FRAME).fill(1000))
  tape.tick(new Uint8Array(FRAME).fill(toMuLaw(500)))
  // Nothing from them this time: just our side.
  tape.tick(new Uint8Array(FRAME).fill(toMuLaw(500)))
  const samples = tape.samples()
  expect(samples).toHaveLength(2 * FRAME)
  expect(samples?.[0]).toBe(1000 + fromMuLaw(toMuLaw(500)))
  expect(samples?.[FRAME]).toBe(fromMuLaw(toMuLaw(500)))
  expect(recorder().samples()).toBeNull()
})
