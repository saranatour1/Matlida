import { Spectrum } from '@spectrum-ts/convex'
import { components, internal } from '../../_generated/api'

/** Photon texting: inbound messages arrive by webhook, replies go out through `sender`. */
export const spectrum = new Spectrum(components.spectrum, {
  sender: internal.api.sender.deliver,
  mode: 'collapse',
})
