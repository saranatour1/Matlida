/**
 * Phone audio for calls through Photon: RTP packets carrying G.711 µ-law
 * (PCMU) at 8 kHz, 20 ms a packet. Pure, so it's tested without a call.
 */

/** Samples in one 20 ms packet at 8 kHz. */
export const FRAME = 160
/** µ-law for silence. */
export const SILENCE = 0xff

const BIAS = 0x84
const CLIP = 32635

/** One 16-bit sample as G.711 µ-law. */
export const toMuLaw = (sample: number) => {
  const sign = (sample >> 8) & 0x80
  let s = Math.min(sign ? -sample : sample, CLIP) + BIAS
  let exponent = 7
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) {
    exponent--
  }
  const mantissa = (s >> (exponent + 3)) & 0x0f
  s = ~(sign | (exponent << 4) | mantissa) & 0xff
  return s
}

export const fromMuLaw = (byte: number) => {
  const u = ~byte & 0xff
  const exponent = (u >> 4) & 0x07
  const sample = ((((u & 0x0f) << 3) + BIAS) << exponent) - BIAS
  return u & 0x80 ? -sample : sample
}

/**
 * Turns the gateway's 24 kHz 16-bit PCM, in chunks of any length, into 8 kHz
 * µ-law. Each output sample averages three input samples, which also cuts
 * what 8 kHz can't carry. Keeps what doesn't divide evenly for the next chunk.
 */
export const downsampler = () => {
  let carry = new Uint8Array(0)
  return (pcm: Uint8Array) => {
    const bytes = new Uint8Array(carry.length + pcm.length)
    bytes.set(carry)
    bytes.set(pcm, carry.length)
    const view = new DataView(bytes.buffer)
    const out = new Uint8Array(Math.floor(bytes.length / 6))
    for (let i = 0; i < out.length; i++) {
      const at = i * 6
      const sum =
        view.getInt16(at, true) +
        view.getInt16(at + 2, true) +
        view.getInt16(at + 4, true)
      out[i] = toMuLaw(Math.round(sum / 3))
    }
    carry = bytes.slice(out.length * 6)
    return out
  }
}

/** 8 kHz samples as 16-bit little-endian PCM, for a WAV. */
export const pcmBytes = (samples: Int16Array) =>
  new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)

export const rtpPacket = ({
  seq,
  timestamp,
  ssrc,
  marker,
  payload,
}: {
  seq: number
  timestamp: number
  ssrc: number
  marker: boolean
  payload: Uint8Array
}) => {
  const packet = new Uint8Array(12 + payload.length)
  const view = new DataView(packet.buffer)
  packet[0] = 0x80
  // Payload type 0: PCMU.
  packet[1] = marker ? 0x80 : 0
  view.setUint16(2, seq & 0xffff)
  view.setUint32(4, timestamp >>> 0)
  view.setUint32(8, ssrc >>> 0)
  packet.set(payload, 12)
  return packet
}

/** The audio in an RTP packet as 16-bit samples, or null when it isn't PCMU audio. */
export const readRtp = (packet: Uint8Array) => {
  if (packet.length < 12 || packet[0] >> 6 !== 2) return null
  if ((packet[1] & 0x7f) !== 0) return null
  let start = 12 + (packet[0] & 0x0f) * 4
  if (packet[0] & 0x10) {
    if (packet.length < start + 4) return null
    start += 4 + ((packet[start + 2] << 8) | packet[start + 3]) * 4
  }
  const end =
    packet[0] & 0x20 ? packet.length - packet[packet.length - 1] : packet.length
  if (end <= start) return null
  const samples = new Int16Array(end - start)
  for (let i = start; i < end; i++) samples[i - start] = fromMuLaw(packet[i])
  return samples
}

/** Loudness of a frame, as the root mean square of its samples. */
const rms = (frame: Int16Array) => {
  let sum = 0
  for (const s of frame) sum += s * s
  return Math.sqrt(sum / frame.length)
}

/**
 * Finds what someone said in a stream of frames: speech starts after 3 loud
 * frames in a row (60 ms), and ends after 0.7 s of quiet or 20 s in all.
 * `push` returns the utterance, with 0.2 s before it, when it ends.
 */
// ponytail: a fixed loudness threshold. An adaptive noise floor if noisy lines trigger it.
export const listener = (threshold = 500) => {
  let before: Array<Int16Array> = []
  let speech: Array<Int16Array> = []
  let loud = 0
  let quiet = 0
  const take = () => {
    const all = new Int16Array(speech.reduce((n, f) => n + f.length, 0))
    let at = 0
    for (const f of speech) {
      all.set(f, at)
      at += f.length
    }
    speech = []
    before = []
    loud = 0
    quiet = 0
    return all
  }
  return {
    push: (frame: Int16Array): Int16Array | null => {
      const isLoud = rms(frame) > threshold
      if (speech.length === 0) {
        before.push(frame)
        if (before.length > 13) before.shift()
        loud = isLoud ? loud + 1 : 0
        if (loud < 3) return null
        speech = before
        before = []
        return null
      }
      speech.push(frame)
      quiet = isLoud ? 0 : quiet + 1
      return quiet >= 35 || speech.length >= 1000 ? take() : null
    },
    reset: () => {
      speech = []
      before = []
      loud = 0
      quiet = 0
    },
  }
}
