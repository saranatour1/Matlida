import { env } from '../_generated/server'

/** A number in international format, like +14155550123. */
export const PHONE_NUMBER = /^\+[1-9]\d{6,14}$/

/**
 * Whether `to` is a number the user typed in `text`. The model may rewrite
 * "0791 234 567" as +962791234567, so the last 7 digits have to match, and
 * a number read from an email or a web page never does.
 */
export const typedBy = (text: string, to: string) =>
  text.replace(/\D/g, '').includes(to.replace(/\D/g, '').slice(-7))

/**
 * Rings `to` from the Photon number. ElevenLabs runs the voice agent and
 * dials out over Photon's SIP connection; the agent says `firstMessage`,
 * then talks with `prompt` as its instructions.
 */
export const callPhone = async ({
  to,
  firstMessage,
  prompt,
}: {
  to: string
  firstMessage: string
  prompt: string
}) => {
  const {
    ELEVENLABS_API_KEY: key,
    ELEVENLABS_AGENT_ID: agentId,
    ELEVENLABS_PHONE_NUMBER_ID: phoneNumberId,
  } = env
  if (!key || !agentId || !phoneNumberId) {
    throw new Error(
      "Phone calls aren't set up: the deployment needs ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID and ELEVENLABS_PHONE_NUMBER_ID.",
    )
  }
  const response = await fetch(
    'https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call',
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        agent_phone_number_id: phoneNumberId,
        to_number: to,
        conversation_initiation_client_data: {
          conversation_config_override: {
            agent: { first_message: firstMessage, prompt: { prompt } },
          },
        },
      }),
    },
  )
  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean
    message?: string
    conversation_id?: string | null
  }
  if (!response.ok || !body.success) {
    throw new Error(
      `The call didn't go through (${response.status}): ${body.message ?? response.statusText}`,
    )
  }
  return { conversationId: body.conversation_id ?? null }
}
