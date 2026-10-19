import { z } from 'zod'
import { internal } from '../../_generated/api'
import { env, httpAction } from '../../_generated/server'
import { verifySvix } from '../../lib/svix'

const zEvent = z.looseObject({ type: z.string() })
const zReceived = z.looseObject({
  data: z.looseObject({
    email_id: z.string().max(200),
    message_id: z.string().max(998).nullish(),
    to: z.array(z.string().max(320)).max(50).nullish(),
  }),
})

/**
 * `POST /resend/inbound`: Resend's webhook. Verifies the Svix signature over
 * the raw bytes before reading anything, records `email.received` events by
 * id, and acknowledges the rest. Nothing is fetched or answered here; the
 * workflow does that after the 200.
 */
export const receiveResendEvent = httpAction(async (ctx, request) => {
  const secret = env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    return new Response('inbound email is not set up', { status: 500 })
  }
  const body = new Uint8Array(await request.arrayBuffer())
  const outcome = await verifySvix({
    body,
    headers: {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    },
    secret,
  })
  if (!outcome.ok) {
    return new Response(outcome.reason, {
      status: outcome.reason === 'missing_headers' ? 400 : 401,
    })
  }
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return new Response('not json', { status: 400 })
  }
  const event = zEvent.safeParse(json)
  if (!event.success) return new Response('malformed event', { status: 400 })
  if (event.data.type !== 'email.received') {
    return new Response('ignored', { status: 200 })
  }
  const received = zReceived.safeParse(json)
  if (!received.success) {
    return new Response('malformed event', { status: 400 })
  }
  const { email_id, message_id, to } = received.data.data
  await ctx.runMutation(internal.api.inbound.receive, {
    emailId: email_id,
    messageId: message_id ?? null,
    to: to ?? [],
  })
  return new Response('ok', { status: 200 })
})
