import { convexGateway } from '@convex-dev/ai-sdk-provider'

/** The model the lead and every bot run on, through the Convex AI gateway. */
export const languageModel = convexGateway('anthropic/claude-sonnet-5')

/** Search-grounded models: quick lookups, and longer research. */
export const searchModel = convexGateway('perplexity/sonar')
export const researchModel = convexGateway('perplexity/sonar-pro')

export const transcriptionModel = convexGateway.transcriptionModel(
  'openai/whisper-large-v3-turbo',
)
