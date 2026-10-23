/**
 * The call's microphone loudness (RMS), posted about every 20 ms from the
 * audio thread. Animation frames stop in a background tab; this doesn't, so
 * calls keep taking turns while you're on another tab.
 */
class Loudness extends AudioWorkletProcessor {
  sum = 0
  count = 0

  process([input]) {
    const samples = input[0]
    if (samples) {
      for (const x of samples) this.sum += x * x
      this.count += samples.length
    }
    // 1024 samples, as many as the analyser read each frame before.
    if (this.count >= 1024) {
      this.port.postMessage(Math.sqrt(this.sum / this.count))
      this.sum = 0
      this.count = 0
    }
    return true
  }
}

registerProcessor('loudness', Loudness)
