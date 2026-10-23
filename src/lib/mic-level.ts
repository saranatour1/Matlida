/**
 * The microphone's loudness about every 20 ms, measured on the browser's
 * audio thread. Unlike `requestAnimationFrame`, it keeps going when the tab
 * is in the background or the window is covered, so a call keeps hearing
 * you while you look at something else.
 */
const PROCESSOR = `
class MicLevel extends AudioWorkletProcessor {
  sum = 0
  count = 0
  process(inputs) {
    const samples = inputs[0] && inputs[0][0]
    if (samples) {
      for (let i = 0; i < samples.length; i++) this.sum += samples[i] * samples[i]
      this.count += samples.length
    }
    if (this.count >= sampleRate / 50) {
      this.port.postMessage(Math.sqrt(this.sum / this.count))
      this.sum = 0
      this.count = 0
    }
    return true
  }
}
registerProcessor('mic-level', MicLevel)
`

/** Starts measuring `source`, calling `onLevel` with each reading (RMS, 0 to 1). Disconnect the node to stop. */
export const startMicLevel = async (
  audio: AudioContext,
  source: AudioNode,
  onLevel: (level: number) => void,
) => {
  const url = URL.createObjectURL(
    new Blob([PROCESSOR], { type: 'text/javascript' }),
  )
  try {
    await audio.audioWorklet.addModule(url)
  } finally {
    URL.revokeObjectURL(url)
  }
  const node = new AudioWorkletNode(audio, 'mic-level')
  node.port.onmessage = (event: MessageEvent<number>) => onLevel(event.data)
  source.connect(node)
  // A node only runs while it leads somewhere: a silent path to the speakers.
  const mute = audio.createGain()
  mute.gain.value = 0
  node.connect(mute).connect(audio.destination)
  return node
}
