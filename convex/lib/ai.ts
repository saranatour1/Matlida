import { convexGateway } from '@convex-dev/ai-sdk-provider'
import { MODELS } from './models'

/** The model the lead and every bot run on, through the Convex AI gateway. */
export const languageModel = convexGateway(MODELS.chat)

/** Search-grounded models: quick lookups, and longer research. */
export const searchModel = convexGateway(MODELS.search)
export const researchModel = convexGateway(MODELS.research)

export const transcriptionModel = convexGateway.transcriptionModel(
  MODELS.transcription,
)

export const speechModel = convexGateway.speechModel(MODELS.speech)
