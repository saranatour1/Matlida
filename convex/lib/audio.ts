import { getServiceToken } from 'convex/server'
import { MODELS } from './models'

/**
 * Audio chat through the Convex AI gateway: a model hears the user and
 * answers in text and speech in one request (docs.convex.dev/ai-gateway/voice).
 * The AI SDK returns only text for these, so this calls Chat Completions.
 */
const GATEWAY = 'https://ai-gateway.convex.dev/v1/chat/completions'

/** The voices the audio chat models speak in. */
export const AUDIO_VOICES = [
  'marin',
  'cedar',
  'coral',
  'sage',
  'ash',
  'verse',
  'ballad',
] as const

/** An assistant's audio chat voice, stable for its name. Matilda's is hers alone. */
export function audioVoiceFor(name: string): (typeof AUDIO_VOICES)[number] {
  if (name === 'Matilda') return AUDIO_VOICES[0]
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AUDIO_VOICES[1 + (hash % (AUDIO_VOICES.length - 1))]
}

/** The models stream 16-bit mono PCM at this rate. */
export const PCM_RATE = 24_000

export type AudioChatTurn = {
  instructions: string
  /** The chat so far, oldest first, as text. */
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  /** What the user said, base64. */
  audio: string
  format: 'wav' | 'mp3'
  voice: string
  model?: string
}

type Chunk = {
  choices?: Array<{
    delta?: {
      content?: string | null
      audio?: { data?: string; transcript?: string }
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    cost?: number
  }
}

/** The JSON of each `data:` line in a server-sent event stream, until `[DONE]`. */
export async function* streamedJson(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const data = line.startsWith('data:') ? line.slice(5).trim() : ''
      if (!data) continue
      if (data === '[DONE]') return
      yield JSON.parse(data) as Chunk
    }
  }
}

export function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * One spoken answer. `onAudio` gets each PCM chunk as it streams, with the
 * words said so far, so playback can start before the answer ends. Returns
 * the whole transcript and the token usage.
 */
export async function audioChat(
  turn: AudioChatTurn,
  onAudio: (pcm: Uint8Array, transcript: string) => Promise<void> | void,
  abortSignal?: AbortSignal,
) {
  const response = await fetch(GATEWAY, {
    method: 'POST',
    signal: abortSignal,
    headers: {
      Authorization: `Bearer ${await getServiceToken('ai-gateway')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: turn.model ?? MODELS.audioChat,
      modalities: ['text', 'audio'],
      audio: { voice: turn.voice, format: 'pcm16' },
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: turn.instructions },
        ...turn.history,
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: turn.audio, format: turn.format },
            },
          ],
        },
      ],
    }),
  })
  if (!response.ok || !response.body) {
    throw new Error(
      `Audio chat ${response.status}: ${(await response.text()).slice(0, 300)}`,
    )
  }
  let transcript = ''
  let usage: Chunk['usage']
  for await (const chunk of streamedJson(response.body)) {
    usage = chunk.usage ?? usage
    const delta = chunk.choices?.[0]?.delta
    transcript += delta?.audio?.transcript ?? delta?.content ?? ''
    if (delta?.audio?.data) {
      await onAudio(base64ToBytes(delta.audio.data), transcript)
    }
  }
  return {
    transcript: transcript.trim(),
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    cost: usage?.cost ?? 0,
  }
}

/** 16-bit mono PCM wrapped as a WAV file, so a browser can play it. */
export function pcmToWav(pcm: Uint8Array, rate = PCM_RATE) {
  const wav = new Uint8Array(44 + pcm.length)
  const view = new DataView(wav.buffer)
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(at + i, value.charCodeAt(i))
    }
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + pcm.length, true)
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
  view.setUint32(40, pcm.length, true)
  wav.set(pcm, 44)
  return wav
}
