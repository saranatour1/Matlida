import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { convexGateway } from '@convex-dev/ai-sdk-provider'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { APICallError } from 'ai'
import type { Doc } from '../_generated/dataModel'
import type { Provider } from '../models/aiConnections/providers'
import { decryptSecret } from './crypto'

export const GATEWAY_MODEL = 'anthropic/claude-sonnet-4.5'

/** The AI SDK v7 chat model type the agent component accepts. */
export type ChatModel = ReturnType<typeof convexGateway>

function providerModel(
  provider: Provider,
  apiKey: string,
  model: string,
): ChatModel {
  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey })(model)
    case 'openai':
      return createOpenAI({ apiKey })(model)
    case 'google':
      return createGoogle({ apiKey })(model)
    case 'openrouter':
      return createOpenRouter({ apiKey }).chat(model)
  }
}

/**
 * The model a project's lead and employees run on: the owner's connection when
 * the project has one, otherwise the Convex AI Gateway.
 */
export async function resolveModel(
  project: Doc<'projects'>,
  connection: Doc<'aiConnections'> | null,
): Promise<ChatModel> {
  if (!connection) return convexGateway(project.model || GATEWAY_MODEL)
  const apiKey = await decryptSecret(connection.secret, connection.ownerId)
  return providerModel(
    connection.provider,
    apiKey,
    project.model || connection.defaultModel,
  )
}

/** One cheap request that only succeeds with a working key. */
export async function checkApiKey(provider: Provider, apiKey: string) {
  const requests: Record<Provider, [string, Record<string, string>]> = {
    anthropic: [
      'https://api.anthropic.com/v1/models',
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    ],
    openai: [
      'https://api.openai.com/v1/models',
      { Authorization: `Bearer ${apiKey}` },
    ],
    google: [
      'https://generativelanguage.googleapis.com/v1beta/models',
      { 'x-goog-api-key': apiKey },
    ],
    openrouter: [
      'https://openrouter.ai/api/v1/key',
      { Authorization: `Bearer ${apiKey}` },
    ],
  }
  const [url, headers] = requests[provider]
  const response = await fetch(url, { headers })
  return response.ok
}

/** True when a provider rejected the API key itself. */
export function isKeyRejected(error: unknown) {
  return (
    APICallError.isInstance(error) &&
    (error.statusCode === 401 || error.statusCode === 403)
  )
}
