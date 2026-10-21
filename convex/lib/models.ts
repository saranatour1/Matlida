/** The AI gateway models the app uses, by job. Plain strings, so the browser can show them too. */
export const MODELS = {
  chat: 'anthropic/claude-sonnet-5',
  /** Fast and cheap, for `quick_summary`. */
  summary: 'google/gemini-2.5-flash',
  search: 'perplexity/sonar',
  research: 'perplexity/sonar-pro',
  transcription: 'openai/whisper-large-v3-turbo',
  speech: 'hexgrad/kokoro-82m',
  /** Hears and answers in voice in one request, for Fast voice. */
  audioChat: 'openai/gpt-audio-mini',
  /** TypeSafe's Jev, for `decide`: typed picks with probabilities. */
  decide: '~typesafe/jev-latest',
} as const

export type Job = keyof typeof MODELS

/**
 * What each job is, for the Models page: its name, the model's name and
 * maker, and where you meet it, in the order and groups the page shows.
 */
export const JOBS = {
  chat: {
    group: 'Thinking and writing',
    name: 'Replies',
    model: 'Claude Sonnet 5',
    maker: 'Anthropic',
    note: 'Every answer in chats, texts, email drafts and calls, with all the tools. Pick another per assistant or per chat.',
  },
  summary: {
    group: 'Thinking and writing',
    name: 'Quick summaries',
    model: 'Gemini 2.5 Flash',
    maker: 'Google',
    note: '/tldr and quick_summary: short summaries of long text, fast and cheap.',
  },
  decide: {
    group: 'Thinking and writing',
    name: 'Decisions',
    model: 'Jev',
    maker: 'TypeSafe',
    note: '/decide: picks between options, with the odds for each.',
  },
  search: {
    group: 'Looking things up',
    name: 'Web search',
    model: 'Sonar',
    maker: 'Perplexity',
    note: 'Current facts with sources in any reply, and the news briefing.',
  },
  research: {
    group: 'Looking things up',
    name: 'Research',
    model: 'Sonar Pro',
    maker: 'Perplexity',
    note: '/research and /report: longer briefs across many sources.',
  },
  transcription: {
    group: 'Voice',
    name: 'Hearing you',
    model: 'Whisper large v3 turbo',
    maker: 'OpenAI',
    note: 'What you say on calls and with the mic button, as text.',
  },
  speech: {
    group: 'Voice',
    name: 'Speaking on calls',
    model: 'Kokoro 82M',
    maker: 'hexgrad',
    note: 'Reads replies out on calls, in each assistant’s own voice.',
  },
  audioChat: {
    group: 'Voice',
    name: 'Fast voice',
    model: 'GPT Audio mini',
    maker: 'OpenAI',
    note: 'Hears you and answers in voice in one step, when Fast voice is on. No tools.',
  },
} satisfies Record<
  Job,
  { group: string; name: string; model: string; maker: string; note: string }
>

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
