'use node'

import { Spectrum } from '@spectrum-ts/core'
import { createCloudSender } from '@spectrum-ts/convex/sender'
import { telegram } from '@spectrum-ts/telegram'
import { whatsappBusiness } from '@spectrum-ts/whatsapp-business'
import { v } from 'convex/values'
import { env, internalAction } from '../../_generated/server'
import { spectrum } from './spectrum'
import type { SendJob, SendOutcome } from '@spectrum-ts/convex/sender'

// One Photon runtime per container and app, reused across sends.
const imessage = createCloudSender()
let telegramApp: ReturnType<typeof startTelegram> | undefined
let whatsappApp: ReturnType<typeof startWhatsapp> | undefined

function credentials() {
  const projectId = env.SPECTRUM_PROJECT_ID
  const projectSecret = env.SPECTRUM_PROJECT_SECRET
  if (!(projectId && projectSecret)) {
    throw new Error('Set SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET.')
  }
  return { projectId, projectSecret }
}

/** Starting it also points the bot's Telegram webhook at Photon. */
async function startTelegram() {
  const botToken = env.TELEGRAM_BOT_TOKEN
  if (!botToken)
    throw new Error('Set TELEGRAM_BOT_TOKEN to message on Telegram.')
  return await Spectrum({
    ...credentials(),
    providers: [telegram.config({ botToken })],
  })
}

/** Photon holds the Meta credentials, so the project's keys are enough. */
async function startWhatsapp() {
  return await Spectrum({
    ...credentials(),
    providers: [whatsappBusiness.config({})],
  })
}

/** Sends a text to a Telegram or WhatsApp chat. Replies are the only kind Matilda sends there. */
async function deliverTo(
  platform: 'telegram' | 'whatsapp_business',
  job: SendJob,
): Promise<SendOutcome> {
  const text = (job.content as { text?: unknown } | undefined)?.text
  if (job.kind !== 'send' || typeof text !== 'string') {
    return { ok: false, error: `Only text sends work on ${platform}.` }
  }
  try {
    let sent: { id?: string } | undefined
    if (platform === 'telegram') {
      // Forget a failed start, so the next send tries again.
      const app = await (telegramApp ??= startTelegram().catch((e: unknown) => {
        telegramApp = undefined
        throw e
      }))
      sent = await (await telegram(app).space.get(job.spaceId)).send(text)
    } else {
      const app = await (whatsappApp ??= startWhatsapp().catch((e: unknown) => {
        whatsappApp = undefined
        throw e
      }))
      sent = await (
        await whatsappBusiness(app).space.get(job.spaceId)
      ).send(text)
    }
    return { ok: true, ...(sent?.id ? { providerMessageId: sent.id } : {}) }
  } catch (error) {
    // Reported, not thrown: the outbox owns retries.
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Delivers one outbox row over Photon, by the app the chat is in, then reports back to the outbox. */
const deliver = internalAction({
  args: {
    rowId: v.string(),
    spaceId: v.string(),
    phone: v.optional(v.string()),
    clientGuid: v.string(),
    kind: v.string(),
    content: v.optional(v.any()),
    targetMessageId: v.optional(v.string()),
    reaction: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, job) => {
    const space = await spectrum.getSpace(ctx, { spaceId: job.spaceId })
    const outcome =
      space?.platform === 'telegram' || space?.platform === 'whatsapp_business'
        ? await deliverTo(space.platform, job)
        : await imessage.deliver(job)
    await spectrum.settle(ctx, { rowId: job.rowId, ...outcome })
    return null
  },
})

/**
 * Points the Telegram bot's webhook at Photon, so its messages reach Matilda.
 * Run once after setting TELEGRAM_BOT_TOKEN: `convex run api/sender:connectTelegram`.
 */
const connectTelegram = internalAction({
  args: {},
  returns: v.null(),
  handler: async () => {
    telegramApp = startTelegram()
    await telegramApp
    return null
  },
})

export const senderApi = { deliver, connectTelegram }
