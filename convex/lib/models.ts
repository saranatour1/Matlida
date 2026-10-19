/** The AI gateway models the app uses. Plain strings, so the browser can show them too. */
export const MODELS = {
  chat: 'anthropic/claude-sonnet-5',
  search: 'perplexity/sonar',
  research: 'perplexity/sonar-pro',
  transcription: 'openai/whisper-large-v3-turbo',
} as const
