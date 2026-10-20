import { convexGateway } from '@convex-dev/ai-sdk-provider'
import { MODELS } from './models'

/** The model the lead and every bot run on unless they pick another, through the Convex AI gateway. */
export const languageModel = convexGateway(MODELS.chat)

/** Any other chat model the gateway serves, by its `provider/model` id. */
export function chatModel(id: string) {
  return convexGateway(id)
}

/** Search-grounded models: quick lookups, and longer research. */
export const searchModel = convexGateway(MODELS.search)
export const researchModel = convexGateway(MODELS.research)

export const transcriptionModel = convexGateway.transcriptionModel(
  MODELS.transcription,
)

export const speechModel = convexGateway.speechModel(MODELS.speech)
