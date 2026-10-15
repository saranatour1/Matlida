/** Providers a user can connect, with an example model id for the form. Plain data, shared with the UI. */
export const PROVIDERS = {
  anthropic: { name: 'Anthropic', exampleModel: 'claude-sonnet-5-5' },
  openai: { name: 'OpenAI', exampleModel: 'gpt-5.6-terra' },
  google: { name: 'Google', exampleModel: 'gemini-3.8-flash' },
  openrouter: {
    name: 'OpenRouter',
    exampleModel: 'anthropic/claude-sonnet-4.5',
  },
} as const

export type Provider = keyof typeof PROVIDERS

export function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && Object.hasOwn(PROVIDERS, value)
}
