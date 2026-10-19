import { z } from 'zod'
import { zLook } from '../../convex/lib/looks'

/** Everything needed to make a copy of an assistant somewhere else. */
const templateSchema = z.object({
  name: z.string().max(40),
  role: z.string().max(80),
  instructions: z.string().max(2000),
  look: zLook,
})

export type BotTemplate = z.infer<typeof templateSchema>

/**
 * The template as a URL-safe string. A template link carries the bot in the
 * URL, so nothing is stored or shared beyond what the link holds.
 */
export function encodeTemplate(template: BotTemplate) {
  const bytes = new TextEncoder().encode(JSON.stringify(template))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

/** The template in a link, or null when it's missing or malformed. */
export function decodeTemplate(text: string | undefined): BotTemplate | null {
  if (!text) return null
  try {
    const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return templateSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return null
  }
}
