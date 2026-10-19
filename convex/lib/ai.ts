import { convexGateway } from '@convex-dev/ai-sdk-provider'

/** The model the lead and every bot run on, through the Convex AI gateway. */
export const languageModel = convexGateway('anthropic/claude-sonnet-5')
