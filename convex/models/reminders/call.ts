/**
 * Places a call with a Vapi voice agent, which dials out over Photon's SIP
 * line. Vapi's end-call function hangs up once the user is done.
 */
export async function placeCall({
  apiKey,
  phoneNumberId,
  to,
  from,
  message,
}: {
  apiKey: string
  phoneNumberId: string
  to: string
  from: string
  message: string
}) {
  const res = await fetch('https://api.vapi.ai/call', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phoneNumberId,
      customer: { number: to },
      assistant: {
        name: from,
        firstMessage: `Hi, it's ${from}. ${message}`,
        endCallFunctionEnabled: true,
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are ${from}, the user's assistant, calling with a reminder: "${message}". Say it plainly, answer follow-up questions briefly, and end the call as soon as the user is done or says goodbye.`,
            },
          ],
        },
      },
    }),
  })
  if (!res.ok) {
    throw new Error(
      `Vapi refused the call (${res.status}): ${await res.text()}`,
    )
  }
}
