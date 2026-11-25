import { PhotonComponent } from '@photon-ai/convex'
import { components, internal } from '../../_generated/api'

/** Photon's platform API (Telegram, and email arriving): the component verifies and dedupes the webhook, and sends replies from its outbox. */
export const photon = new PhotonComponent(components.photon, {
  onTurn: internal.api.texts.turn,
})
