import { expect, test } from 'vitest'
import { CHAT_MODELS, MODELS, isListedModel, modelName } from '../../lib/models'

test('chat models are looked up by id, and anything else shows its id', () => {
  expect(isListedModel(MODELS.chat)).toBe(true)
  expect(modelName(undefined)).toBe(CHAT_MODELS[MODELS.chat].name)
  expect(modelName('x-ai/grok-4.7')).toBe('Grok 4.7')
  expect(modelName('mistralai/mistral-large')).toBe('mistralai/mistral-large')
  // Only the map's own keys count, not what every object inherits.
  expect(isListedModel('constructor')).toBe(false)
  expect(isListedModel(undefined)).toBe(false)
})
