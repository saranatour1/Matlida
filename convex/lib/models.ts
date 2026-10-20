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

/**
 * Chat models the app offers, all served by the Convex AI gateway
 * (docs.convex.dev/ai-gateway/models). Any other gateway id works too, typed
 * in by hand; the gateway refuses ids it doesn't serve.
 */
export const CHAT_MODELS: ReadonlyArray<{
  id: string
  name: string
  maker: string
  note: string
}> = [
  {
    id: 'anthropic/claude-sonnet-5',
    name: 'Claude Sonnet 5',
    maker: 'Anthropic',
    note: 'The default: fast and careful.',
  },
  {
    id: 'anthropic/claude-opus-5',
    name: 'Claude Opus 5',
    maker: 'Anthropic',
    note: 'Deeper thinking, slower and dearer.',
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    maker: 'Anthropic',
    note: 'Quick and cheap, for simple work.',
  },
  {
    id: 'openai/gpt-5',
    name: 'GPT-5',
    maker: 'OpenAI',
    note: 'OpenAI’s flagship.',
  },
  {
    id: 'openai/gpt-5-mini',
    name: 'GPT-5 mini',
    maker: 'OpenAI',
    note: 'Smaller and faster.',
  },
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    maker: 'Google',
    note: 'Long context, strong on documents.',
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    maker: 'Google',
    note: 'Fast and cheap.',
  },
  {
    id: 'deepseek/deepseek-v3.2',
    name: 'DeepSeek V3.2',
    maker: 'DeepSeek',
    note: 'Open weights, good value.',
  },
]

/** A gateway model id, `provider/model`, with an optional `~` for a rolling alias. */
export const MODEL_ID = /^~?[a-z0-9-]+\/[a-z0-9._:-]+$/i

/** The model's name when it's one we list, else its id. */
export function modelName(id: string | undefined) {
  const known = CHAT_MODELS.find((m) => m.id === (id ?? MODELS.chat))
  return known?.name ?? id ?? MODELS.chat
}
