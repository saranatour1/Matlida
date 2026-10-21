/** The AI gateway models the app uses. Plain strings, so the browser can show them too. */
export const MODELS = {
  chat: 'anthropic/claude-sonnet-5',
  search: 'perplexity/sonar',
  research: 'perplexity/sonar-pro',
  transcription: 'openai/whisper-large-v3-turbo',
  speech: 'hexgrad/kokoro-82m',
  /** TypeSafe's Jev, for `decide`: typed picks with probabilities. */
  decide: '~typesafe/jev-latest',
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

/** A chat model the app offers, as the menus show it. */
export type ChatModel = { name: string; maker: string; note: string }

/**
 * Chat models the app offers, by gateway id, all served by the Convex AI
 * gateway (docs.convex.dev/ai-gateway/models). Any other gateway id works
 * too, typed in by hand; the gateway refuses ids it doesn't serve.
 */
export const CHAT_MODELS = {
  'anthropic/claude-sonnet-5': {
    name: 'Claude Sonnet 5',
    maker: 'Anthropic',
    note: 'The default: fast and careful.',
  },
  'anthropic/claude-opus-5': {
    name: 'Claude Opus 5',
    maker: 'Anthropic',
    note: 'Deeper thinking, slower and dearer.',
  },
  'anthropic/claude-haiku-4.5': {
    name: 'Claude Haiku 4.5',
    maker: 'Anthropic',
    note: 'Quick and cheap, for simple work.',
  },
  'openai/gpt-5': {
    name: 'GPT-5',
    maker: 'OpenAI',
    note: 'OpenAI’s flagship.',
  },
  'openai/gpt-5-mini': {
    name: 'GPT-5 mini',
    maker: 'OpenAI',
    note: 'Smaller and faster.',
  },
  'google/gemini-2.5-pro': {
    name: 'Gemini 2.5 Pro',
    maker: 'Google',
    note: 'Long context, strong on documents.',
  },
  'google/gemini-2.5-flash': {
    name: 'Gemini 2.5 Flash',
    maker: 'Google',
    note: 'Fast and cheap.',
  },
  'deepseek/deepseek-v3.2': {
    name: 'DeepSeek V3.2',
    maker: 'DeepSeek',
    note: 'Open weights, good value.',
  },
  'x-ai/grok-4.7': { name: 'Grok 4.7', maker: 'xAI', note: 'xAI’s latest.' },
  'meta/muse-spark-1.3': {
    name: 'Muse Spark 1.3',
    maker: 'Meta',
    note: 'Meta’s Muse.',
  },
} satisfies Record<string, ChatModel>

export type ChatModelId = keyof typeof CHAT_MODELS

/** Whether `id` is one of the chat models the menus list. */
export function isListedModel(id: string | undefined): id is ChatModelId {
  return id !== undefined && Object.hasOwn(CHAT_MODELS, id)
}

/** A gateway model id, `provider/model`, with an optional `~` for a rolling alias. */
export const MODEL_ID = /^~?[a-z0-9-]+\/[a-z0-9._:-]+$/i

/** The model's name when it's one we list, else its id. */
export function modelName(id: string | undefined) {
  const model = id ?? MODELS.chat
  return isListedModel(model) ? CHAT_MODELS[model].name : model
}

/**
 * How hard an assistant works on one reply: the steps it may take, the bots
 * it may ask, and the model's reasoning effort. Medium unless picked.
 */
export const EFFORTS = {
  low: {
    name: 'Low',
    note: 'Quick answers, few steps.',
    steps: 4,
    botCalls: 2,
  },
  medium: {
    name: 'Medium',
    note: 'The default.',
    steps: 8,
    botCalls: 6,
  },
  high: {
    name: 'High',
    note: 'Thinks longer, more steps and bots.',
    steps: 20,
    botCalls: 12,
  },
} as const

export type Effort = keyof typeof EFFORTS
