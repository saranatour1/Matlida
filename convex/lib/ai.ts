import { convexGateway } from '@convex-dev/ai-sdk-provider'
import { MODELS } from './models'
import type { Experimental_DecisionModel } from 'ai'

/** The model the lead and every bot run on unless they pick another, through the Convex AI gateway. */
export const languageModel = convexGateway(MODELS.chat)

/** Any other chat model the gateway serves, by its `provider/model` id. */
export function chatModel(id: string) {
  return convexGateway(id)
}

/** Fast and cheap, for quick summaries. */
export const summaryModel = convexGateway(MODELS.summary)

/** Search-grounded models: quick lookups, and longer research. */
export const searchModel = convexGateway(MODELS.search)
export const researchModel = convexGateway(MODELS.research)

export const transcriptionModel = convexGateway.transcriptionModel(
  MODELS.transcription,
)

/** Pictures for `generate_image`. */
export const imageModel = convexGateway.imageModel(MODELS.image)

export const speechModel = convexGateway.speechModel(MODELS.speech)

/** Jev, through the gateway's decisions endpoint (alpha), for `decide`. */
export const decisionModel: Experimental_DecisionModel =
  convexGateway.evaluationModel(MODELS.decide)
