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
  /** OpenAI's Decisions model, for calls: whether a turn needs the assistant's tools, and whether to hang up. */
  callDecide: 'openai/gpt-6-luna-decisions',
  /** Answers what needs no tools on a call, so the reply starts sooner. */
  quickVoice: 'anthropic/claude-haiku-5.5',
  image: 'openai/gpt-image-1',
  video: 'google/veo-3.1-fast',
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
    note: '/decide: picks between options, with the odds for each. Also checks what from earlier still needs a follow-up, in chats, texts and calls.',
  },
  callDecide: {
    group: 'Voice',
    name: 'Call decisions',
    model: 'GPT-6 Luna Decisions',
    maker: 'OpenAI',
    note: 'On calls, as soon as you’ve spoken: whether a quick answer will do or the assistant needs its tools, and whether to hang up after the reply.',
  },
  quickVoice: {
    group: 'Voice',
    name: 'Quick answers on calls',
    model: 'Claude Haiku 5.5',
    maker: 'Anthropic',
    note: 'Small talk and anything answered from the conversation, with no tools, so the reply starts sooner. The rest goes to the assistant’s own model.',
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
  image: {
    group: 'Images and video',
    name: 'Images',
    model: 'GPT Image 1',
    maker: 'OpenAI',
    note: '/image: pictures from a description, saved in your Convex storage.',
  },
  video: {
    group: 'Images and video',
    name: 'Videos',
    model: 'Veo 3.1 Fast',
    maker: 'Google',
    note: '/video: 8-second clips from a description, made in the background and saved in your Convex storage.',
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

/** How the Kokoro voices are shown. */
export const VOICE_NAMES: Record<(typeof VOICES)[number], string> = {
  af_heart: 'Heart',
  af_bella: 'Bella',
  af_nicole: 'Nicole',
  am_adam: 'Adam',
  am_michael: 'Michael',
  bm_george: 'George',
}

/** Languages a call can be held in, by ISO 639-1 code. Unset means whatever you speak. */
export const LANGUAGES = {
  en: 'English',
  ar: 'Arabic',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  tr: 'Turkish',
  hi: 'Hindi',
  ja: 'Japanese',
  zh: 'Chinese',
} as const
export type Language = keyof typeof LANGUAGES

/** An assistant's voice, stable for its name. Matilda's is hers alone. */
export const voiceFor = (name: string): (typeof VOICES)[number] => {
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
export const isListedModel = (id: string | undefined): id is ChatModelId => {
  return id !== undefined && Object.hasOwn(CHAT_MODELS, id)
}

/** A gateway model id, `provider/model`, with an optional `~` for a rolling alias. */
export const MODEL_ID = /^~?[a-z0-9-]+\/[a-z0-9._:-]+$/i

/** The model's name when it's one we list, else its id. */
export const modelName = (id: string | undefined) => {
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
