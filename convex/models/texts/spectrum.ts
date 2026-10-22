import { Spectrum } from '@spectrum-ts/convex'
import { components, internal } from '../../_generated/api'

/** Photon messaging (iMessage, WhatsApp, Telegram): inbound messages arrive by webhook, replies go out through `sender`. */
export const spectrum = new Spectrum(components.spectrum, {
  onBatch: internal.api.texts.batch,
  sender: internal.api.sender.deliver,
  mode: 'collapse',
})
