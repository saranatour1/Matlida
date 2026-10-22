/** Audio chat models take WAV or MP3, and browsers record WebM, so recordings are converted here. */
const RATE = 16_000

/** Mono samples from -1 to 1 as a 16-bit PCM WAV file. */
export const encodeWav = (samples: Float32Array, rate: number) => {
  const wav = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(wav.buffer)
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(at + i, value.charCodeAt(i))
    }
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, i) => {
    const s = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  })
  return wav
}

/** A recording as a 16 kHz mono WAV: decoded and resampled by the browser, channels averaged. */
export const toWav = async (recording: Blob) => {
  const decoded = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(
    await recording.arrayBuffer(),
  )
  const mono = new Float32Array(decoded.length)
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c)
    for (let i = 0; i < mono.length; i++) {
      mono[i] += channel[i] / decoded.numberOfChannels
    }
  }
  return new Blob([encodeWav(mono, decoded.sampleRate)], { type: 'audio/wav' })
}
