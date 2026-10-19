/** The AI gateway models the app uses. Plain strings, so the browser can show them too. */
export const MODELS = {
  chat: 'anthropic/claude-sonnet-5',
  search: 'perplexity/sonar',
  research: 'perplexity/sonar-pro',
  transcription: 'openai/whisper-large-v3-turbo',
  speech: 'hexgrad/kokoro-82m',
} as const

/** Kokoro voices the assistants speak in on calls. */
export const VOICES = [
  'af_heart',
  'af_bella',
  'af_nicole',
  'am_adam',
  'am_michael',
  'bm_george',
] as const

/** An assistant's voice, stable for its name. Matilda's is hers alone. */
export function voiceFor(name: string): (typeof VOICES)[number] {
  if (name === 'Matilda') return VOICES[0]
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return VOICES[1 + (hash % (VOICES.length - 1))]
}

/** How each Photon messaging app is named in the app, by Photon's id for it. */
export const MESSAGING_APPS: Record<string, string> = {
  imessage: 'iMessage',
  telegram: 'Telegram',
  whatsapp_business: 'WhatsApp',
}
