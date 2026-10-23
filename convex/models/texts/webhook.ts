import { z } from 'zod'
import { internal } from '../../_generated/api'
import { env, httpAction } from '../../_generated/server'
import { verifyWebhook } from '../../lib/webhooks'

/** The parts of Photon's `message.received` event this route reads. */
const zReceived = z.object({
  type: z.literal('message.received'),
  data: z.object({
    object: z.object({
      id: z.string(),
      platform: z.string(),
      content: z.object({ type: z.string(), text: z.string().optional() }),
      receivedBy: z.object({ id: z.string() }).optional(),
      space: z.object({ id: z.string() }),
    }),
  }),
})

/**
 * `POST /photon/webhook`: events from Photon's platform API. The signature is
 * checked over the raw bytes before anything is parsed. A Telegram text is
 * recorded and answered; an email starts the email check. Everything else is
 * acknowledged and ignored.
 */
export const photonWebhook = httpAction(async (ctx, request) => {
  const secret = env.PHOTON_WEBHOOK_SECRET
  if (!secret) {
    return new Response('Set PHOTON_WEBHOOK_SECRET.', { status: 500 })
  }
  const body = new Uint8Array(await request.arrayBuffer())
  const check = await verifyWebhook({ body, headers: request.headers, secret })
  if (!check.ok) {
    // Header names only, never values, to see what Photon signs with.
    console.warn(
      `Photon webhook refused (${check.reason}). Headers: ${[...request.headers.keys()].join(', ')}`,
    )
    return new Response(check.reason, {
      status: check.reason === 'missing_headers' ? 400 : 401,
    })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return new Response('Not JSON.', { status: 400 })
  }
  const event = zReceived.safeParse(parsed)
  if (!event.success) return new Response('ok')
  const message = event.data.data.object

  if (message.platform === 'email') {
    await ctx.runMutation(internal.api.emails.schedulePoll, {})
  } else if (
    message.platform === 'telegram' &&
    message.content.type === 'text' &&
    message.content.text &&
    message.receivedBy
  ) {
    await ctx.runMutation(internal.api.texts.received, {
      messageId: message.id,
      spaceId: message.space.id,
      platform: message.platform,
      agentId: message.receivedBy.id,
      text: message.content.text,
    })
  }
  return new Response('ok')
})
