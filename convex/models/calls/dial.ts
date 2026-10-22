/// <reference types="node" />
'use node'

import dgram from 'node:dgram'
import { randomBytes } from 'node:crypto'
import tls from 'node:tls'
import { transcribe } from 'ai'
import { v } from 'convex/values'
import { internal } from '../../_generated/api'
import { env, internalAction } from '../../_generated/server'
import { transcriptionModel } from '../../lib/ai'
import { audioChat, audioVoiceFor, pcmToWav } from '../../lib/audio'
import { metered } from '../../lib/budget'
import { MODELS } from '../../lib/models'
import {
  FRAME,
  SILENCE,
  downsampler,
  listener,
  pcmBytes,
  readRtp,
  rtpPacket,
} from '../../lib/rtp'
import {
  SIP_HOST,
  digest,
  format,
  header,
  headers,
  pickChallenge,
  randomHex,
  sdpAnswer,
  sdpOffer,
  splitList,
  takeMessages,
  uriOf,
} from '../../lib/sip'
import { gatewayCost } from '../usage/functions'
import type { AudioChatTurn } from '../../lib/audio'
import type { SipMessage } from '../../lib/sip'
import type { ActionCtx, Doc } from '../../lib/ctx'
import type { Infer } from 'convex/values'
import type { phoneStatus } from './table'

const RING_MS = 45_000
/** Actions stop at 10 minutes, so a call hangs up before. */
const MAX_CALL_MS = 9 * 60_000
/** Hang up after this long without hearing them. */
const QUIET_MS = 20_000

type Ending = {
  status: Infer<typeof phoneStatus>
  note?: string
  heard?: number
}

/** Our public address for `socket`, from Google's STUN server. */
const publicAddress = (socket: dgram.Socket) =>
  new Promise<{ ip: string; port: number } | null>((resolve) => {
    const id = randomBytes(12)
    const done = (address: { ip: string; port: number } | null) => {
      clearTimeout(timer)
      socket.off('message', onMessage)
      resolve(address)
    }
    const onMessage = (msg: Buffer) => {
      if (msg.length < 20 || !msg.subarray(8, 20).equals(id)) return
      for (let at = 20; at + 4 <= msg.length;) {
        const type = msg.readUInt16BE(at)
        const length = msg.readUInt16BE(at + 2)
        // XOR-MAPPED-ADDRESS, IPv4.
        if (type === 0x0020 && msg[at + 5] === 0x01) {
          const ip = [0, 1, 2, 3]
            .map((i) => msg[at + 8 + i] ^ [0x21, 0x12, 0xa4, 0x42][i])
            .join('.')
          return done({ ip, port: msg.readUInt16BE(at + 6) ^ 0x2112 })
        }
        at += 4 + length + ((4 - (length % 4)) % 4)
      }
      done(null)
    }
    const timer = setTimeout(() => done(null), 3000)
    socket.on('message', onMessage)
    const request = Buffer.concat([
      Buffer.from([0x00, 0x01, 0x00, 0x00, 0x21, 0x12, 0xa4, 0x42]),
      id,
    ])
    socket.send(request, 19302, 'stun.l.google.com')
  })

/** A TLS connection to Photon's SIP server: send messages, and wait for responses. */
const openSip = async (host: string) => {
  const socket = tls.connect({ host, port: 5061, servername: host })
  await new Promise<void>((resolve, reject) => {
    socket.once('secureConnect', resolve)
    socket.once('error', reject)
  })
  let buffer: Buffer = Buffer.alloc(0)
  const inbox: Array<SipMessage> = []
  const waiting = new Set<() => void>()
  let onRequest = (_request: SipMessage) => {}
  let closed = false
  socket.on('data', (chunk: Buffer) => {
    const { messages, rest } = takeMessages(Buffer.concat([buffer, chunk]))
    buffer = rest
    for (const message of messages) {
      if (message.method) onRequest(message)
      else inbox.push(message)
    }
    for (const check of [...waiting]) check()
  })
  socket.on('error', (error) => console.error('SIP connection', error))
  socket.on('close', () => {
    closed = true
    for (const check of [...waiting]) check()
  })
  return {
    local: `${socket.localAddress}:${socket.localPort}`,
    send: (text: string) => {
      if (!closed) socket.write(text)
    },
    /** The next response for `cseq` (like "1 INVITE"), or null after `ms` or when the connection closes. */
    next: (cseq: string, ms: number) =>
      new Promise<SipMessage | null>((resolve) => {
        const check = () => {
          const at = inbox.findIndex((m) => header(m, 'cseq') === cseq)
          if (at < 0 && !closed) return
          clearTimeout(timer)
          waiting.delete(check)
          resolve(at < 0 ? null : inbox.splice(at, 1)[0])
        }
        const timer = setTimeout(
          () => {
            waiting.delete(check)
            resolve(null)
          },
          Math.max(0, ms),
        )
        waiting.add(check)
        check()
      }),
    onRequest: (handler: (request: SipMessage) => void) => {
      onRequest = handler
    },
    isClosed: () => closed,
    close: () => socket.destroy(),
  }
}

const instructionsFor = ({
  from,
  owner,
  to,
  say,
  about,
}: {
  from: string
  owner: string
  to: string
  say: string
  about: string
}) =>
  [
    `You are ${from}, an AI assistant, on a phone call you placed to ${to} for ${owner}.`,
    `Why you called: ${about}`,
    `You opened with: "${say}"`,
    'Speak naturally, in one or two short sentences at a time, with no lists or formatting.',
    `Only say what you know from this. If they ask for anything else, say you'll pass it on to ${owner}. If they ask, you're an AI assistant.`,
    'When the conversation is over, say a short goodbye that ends with the word "Goodbye."',
  ].join('\n')

/**
 * Places one call through Photon and talks until it ends: SIP over TLS to
 * Photon's server, G.711 audio over UDP, and every turn through the AI
 * gateway (transcribed for the record while the audio chat model answers in
 * voice). Returns how it ended.
 */
const placeCall = async (
  ctx: ActionCtx,
  {
    call,
    project,
    owner,
    from,
    say,
    about,
  }: {
    call: Doc<'calls'> & { phone: NonNullable<Doc<'calls'>['phone']> }
    project: Doc<'projects'>
    owner: string
    from: string
    say: string
    about: string
  },
): Promise<Ending> => {
  // The outbound SIP credential from the line's Voice profile in Photon.
  const username = env.PHOTON_SIP_USERNAME
  const password = env.PHOTON_SIP_PASSWORD
  const line = env.PHOTON_PHONE_NUMBER
  const host = env.PHOTON_SIP_HOST ?? SIP_HOST
  if (!username || !password || !line) {
    return {
      status: 'failed',
      note: 'Phone calls need PHOTON_SIP_USERNAME, PHOTON_SIP_PASSWORD and PHOTON_PHONE_NUMBER on the deployment',
    }
  }
  const to = call.phone.to
  const threadId = call.threadId ?? ''
  const userId = project.ownerId

  const rtp = dgram.createSocket('udp4')
  rtp.on('error', (error) => console.error('RTP socket', error))
  await new Promise<void>((resolve) => rtp.bind(0, resolve))
  const mapped = await publicAddress(rtp)
  if (!mapped) {
    rtp.close()
    return { status: 'failed', note: "couldn't find our public address" }
  }
  const sip = await openSip(host)
  const offer = sdpOffer(mapped.ip, mapped.port)
  const target = `sip:${to}@${host}`
  const fromHeader = `<sip:${line}@${host}>;tag=${randomHex(4)}`
  const callId = `${randomHex(12)}@matilda`
  const contact = `<sip:matilda@${sip.local};transport=tls>`
  const via = () =>
    `SIP/2.0/TLS ${sip.local};branch=z9hG4bK${randomHex(8)};rport;alias`
  let cseq = 1

  /** Our answer to a request from Photon, like its BYE. */
  const respond = (request: SipMessage, body = '') =>
    sip.send(
      format(
        'SIP/2.0 200 OK',
        [
          ...headers(request, 'via').map((h): [string, string] => ['Via', h]),
          ['From', header(request, 'from') ?? ''],
          ['To', header(request, 'to') ?? ''],
          ['Call-ID', header(request, 'call-id') ?? ''],
          ['CSeq', header(request, 'cseq') ?? ''],
          ...(body
            ? [
                ['Contact', contact] as [string, string],
                ['Content-Type', 'application/sdp'] as [string, string],
              ]
            : []),
        ],
        body,
      ),
    )

  // Photon's keep-alives (OPTIONS) and the like get a plain OK.
  sip.onRequest((request) => {
    if (request.method !== 'ACK') respond(request)
  })

  // Dial, answering one digest challenge with the line's SIP credential.
  let auth: [string, string] | undefined
  let inviteVia = ''
  let n = 0
  let answer: SipMessage | null = null
  let remote: { ip: string; port: number } | null = null
  let ringing = false
  const deadline = performance.now() + RING_MS
  for (let attempt = 0; attempt < 2; attempt++) {
    inviteVia = via()
    n = cseq++
    sip.send(
      format(
        `INVITE ${target} SIP/2.0`,
        [
          ['Via', inviteVia],
          ['Max-Forwards', '70'],
          ['From', fromHeader],
          ['To', `<${target}>`],
          ['Call-ID', callId],
          ['CSeq', `${n} INVITE`],
          ['Contact', contact],
          ['Allow', 'INVITE, ACK, CANCEL, BYE, OPTIONS'],
          ['User-Agent', 'Matilda'],
          ...(auth ? [auth] : []),
          ['Content-Type', 'application/sdp'],
        ],
        offer,
      ),
    )
    for (;;) {
      answer = await sip.next(`${n} INVITE`, deadline - performance.now())
      if (!answer?.status || answer.status >= 200) break
      if (answer.status === 180 || answer.status === 183) {
        remote = sdpAnswer(answer.body) ?? remote
        if (!ringing) {
          ringing = true
          await ctx.runMutation(internal.api.calls.setPhone, {
            id: call._id,
            status: 'ringing',
          })
        }
      }
    }
    if (answer?.status && answer.status >= 300) {
      // A failed INVITE is acknowledged on the same branch.
      sip.send(
        format(`ACK ${target} SIP/2.0`, [
          ['Via', inviteVia],
          ['Max-Forwards', '70'],
          ['From', fromHeader],
          ['To', header(answer, 'to') ?? `<${target}>`],
          ['Call-ID', callId],
          ['CSeq', `${n} ACK`],
        ]),
      )
    }
    const challenge =
      (answer?.status === 401 || answer?.status === 407) &&
      pickChallenge(answer)
    if (!challenge || auth) break
    auth = [
      answer?.status === 407 ? 'Proxy-Authorization' : 'Authorization',
      digest({
        challenge,
        method: 'INVITE',
        uri: target,
        username,
        password,
      }),
    ]
  }

  if (!answer?.status) {
    if (!sip.isClosed()) {
      // Nobody picked up in time: cancel the INVITE, then acknowledge its 487.
      sip.send(
        format(`CANCEL ${target} SIP/2.0`, [
          ['Via', inviteVia],
          ['Max-Forwards', '70'],
          ['From', fromHeader],
          ['To', `<${target}>`],
          ['Call-ID', callId],
          ['CSeq', `${n} CANCEL`],
        ]),
      )
      const ended = await sip.next(`${n} INVITE`, 3000)
      if (ended) {
        sip.send(
          format(`ACK ${target} SIP/2.0`, [
            ['Via', inviteVia],
            ['Max-Forwards', '70'],
            ['From', fromHeader],
            ['To', header(ended, 'to') ?? `<${target}>`],
            ['Call-ID', callId],
            ['CSeq', `${n} ACK`],
          ]),
        )
      }
    }
    const dropped = sip.isClosed()
    sip.close()
    rtp.close()
    return dropped && !ringing
      ? { status: 'failed', note: 'the connection to Photon closed' }
      : { status: 'no_answer' }
  }
  if (answer.status >= 300) {
    sip.close()
    rtp.close()
    const status = answer.status
    if (status === 486 || status === 600) return { status: 'busy' }
    if (status === 603) return { status: 'busy', note: 'they declined' }
    if (status === 408 || status === 480 || status === 487) {
      return { status: 'no_answer' }
    }
    return { status: 'failed', note: `${status} ${answer.reason ?? ''}`.trim() }
  }

  // Answered. Acknowledge it, then talk until someone hangs up.
  const toHeader = header(answer, 'to') ?? `<${target}>`
  const remoteTarget = uriOf(header(answer, 'contact') ?? target)
  const routes = headers(answer, 'record-route').flatMap(splitList).reverse()
  const inDialog = (
    method: string,
    number: number,
  ): Array<[string, string]> => [
    ['Via', via()],
    ['Max-Forwards', '70'],
    ['From', fromHeader],
    ['To', toHeader],
    ['Call-ID', callId],
    ['CSeq', `${number} ${method}`],
    ...routes.map((r): [string, string] => ['Route', r]),
  ]
  sip.send(format(`ACK ${remoteTarget} SIP/2.0`, inDialog('ACK', n)))
  remote = sdpAnswer(answer.body) ?? remote
  if (!remote) {
    const bye = cseq++
    sip.send(format(`BYE ${remoteTarget} SIP/2.0`, inDialog('BYE', bye)))
    sip.close()
    rtp.close()
    return { status: 'failed', note: 'Photon answered without PCMU audio' }
  }
  await ctx.runMutation(internal.api.calls.setPhone, {
    id: call._id,
    status: 'answered',
  })

  let theyHungUp = false as boolean
  let resolveEnd: (ending: Ending) => void = () => {}
  const ended = new Promise<Ending>((resolve) => {
    resolveEnd = resolve
  })
  sip.onRequest((request) => {
    if (request.method === 'ACK') return
    respond(request, request.method === 'INVITE' ? offer : '')
    if (request.method === 'BYE') {
      theyHungUp = true
      resolveEnd({ status: 'ended' })
    }
  })

  // Audio out: 20 ms of µ-law every 20 ms, speech when there is some, silence otherwise.
  const out: Array<Uint8Array> = []
  let outBytes = 0
  const silence = new Uint8Array(FRAME).fill(SILENCE)
  const takeFrame = () => {
    if (outBytes === 0) return null
    const payload = new Uint8Array(FRAME).fill(SILENCE)
    let at = 0
    while (at < FRAME && out.length) {
      const chunk = out[0]
      const count = Math.min(FRAME - at, chunk.length)
      payload.set(chunk.subarray(0, count), at)
      at += count
      if (count === chunk.length) out.shift()
      else out[0] = chunk.subarray(count)
    }
    outBytes -= at
    return payload
  }
  const clearOut = () => {
    out.length = 0
    outBytes = 0
  }
  let seq = randomBytes(2).readUInt16BE()
  let timestamp = randomBytes(4).readUInt32BE()
  const ssrc = randomBytes(4).readUInt32BE()
  let talking = false
  let nextAt = performance.now()
  let pumpTimer: NodeJS.Timeout | undefined
  const pump = () => {
    const now = performance.now()
    // A paused container comes back late: skip ahead instead of bursting.
    if (now - nextAt > 100) nextAt = now
    while (nextAt <= now) {
      const speech = takeFrame()
      if (remote) {
        rtp.send(
          rtpPacket({
            seq: seq++,
            timestamp,
            ssrc,
            marker: Boolean(speech) && !talking,
            payload: speech ?? silence,
          }),
          remote.port,
          remote.ip,
        )
      }
      talking = Boolean(speech)
      timestamp += FRAME
      nextAt += 20
    }
    pumpTimer = setTimeout(pump, Math.max(0, nextAt - performance.now()))
  }
  pump()
  const drained = () =>
    new Promise<void>((resolve) => {
      const check = () => (outBytes === 0 ? resolve() : setTimeout(check, 40))
      check()
    })

  // Audio in: count every packet, and listen for speech when it's their turn.
  let heard = 0
  let busy = true
  let lastHeard = performance.now()
  const ear = listener()
  let onSpeech = (_samples: Int16Array) => {}
  rtp.on('message', (msg, source) => {
    const samples = readRtp(new Uint8Array(msg))
    if (!samples) return
    heard++
    // Send where their audio really comes from, which can differ from their SDP.
    if (
      remote &&
      (remote.ip !== source.address || remote.port !== source.port)
    ) {
      remote = { ip: source.address, port: source.port }
    }
    if (busy) return
    const said = ear.push(samples)
    if (said) onSpeech(said)
  })

  const history: AudioChatTurn['history'] = []
  const instructions = instructionsFor({ from, owner, to, say, about })
  const addLine = (who: 'you' | 'them', text: string) =>
    ctx.runMutation(internal.api.calls.addLine, {
      callId: call._id,
      projectId: project._id,
      threadId,
      who,
      text,
    })
  /** One spoken answer, played as it streams. Returns what was said. */
  const speak = async (
    input: { text: string } | { audio: string; format: 'wav' },
    signal?: AbortSignal,
  ) => {
    const toPhone = downsampler()
    const spoken = await metered(
      ctx,
      { userId, model: MODELS.audioChat, estimate: 0.05 },
      async () => {
        const result = await audioChat(
          { instructions, history, voice: audioVoiceFor(from), ...input },
          (pcm) => {
            const mu = toPhone(pcm)
            out.push(mu)
            outBytes += mu.length
          },
          signal,
        )
        return { result, cost: result.cost }
      },
    )
    await ctx.runMutation(internal.api.usage.record, {
      projectId: project._id,
      threadId,
      kind: 'voice',
      label: `${from} (phone call)`,
      aiCost: spoken.cost,
      inputTokens: spoken.inputTokens,
      outputTokens: spoken.outputTokens,
    })
    return spoken.transcript
  }
  const hear = (wav: Uint8Array) =>
    metered(
      ctx,
      { userId, model: MODELS.transcription, estimate: 0.01 },
      async () => {
        const result = await transcribe({
          model: transcriptionModel,
          audio: wav,
        })
        return {
          result: result.text.trim(),
          cost: gatewayCost(result.providerMetadata),
        }
      },
    )
  const listen = async () => {
    await drained()
    ear.reset()
    lastHeard = performance.now()
    busy = false
  }
  const goodbye = (text: string) => /goodbye[.!]*\s*$/i.test(text)

  const talk = async () => {
    const opening = await speak({
      text: `The call just connected. Say exactly this, and nothing else: "${say}"`,
    })
    history.push({ role: 'assistant', content: opening || say })
    await addLine('them', opening || say)
    await listen()
    onSpeech = (samples) => {
      busy = true
      void (async () => {
        const wav = pcmToWav(pcmBytes(samples), 8000)
        const stop = new AbortController()
        const hearing = hear(wav).then((text) => {
          if (!text) stop.abort()
          return text
        })
        const answering = speak(
          { audio: Buffer.from(wav).toString('base64'), format: 'wav' },
          stop.signal,
        ).catch((error: unknown) => {
          if (stop.signal.aborted) return null
          throw error
        })
        const [them, reply] = await Promise.all([hearing, answering])
        if (!them) {
          // Noise, not words: drop whatever the reply had started saying.
          clearOut()
          await listen()
          return
        }
        history.push({ role: 'user', content: them })
        await addLine('you', them)
        if (reply) {
          history.push({ role: 'assistant', content: reply })
          await addLine('them', reply)
        }
        await listen()
        if (reply && goodbye(reply)) resolveEnd({ status: 'ended' })
      })().catch((error: unknown) => {
        console.error(error)
        resolveEnd({
          status: 'ended',
          note: error instanceof Error ? error.message : String(error),
        })
      })
    }
  }
  talk().catch((error: unknown) => {
    console.error(error)
    resolveEnd({
      status: 'ended',
      note: error instanceof Error ? error.message : String(error),
    })
  })

  const answeredAt = performance.now()
  const watch = setInterval(() => {
    const now = performance.now()
    if (sip.isClosed())
      resolveEnd({ status: 'ended', note: 'the line dropped' })
    if (now - answeredAt > MAX_CALL_MS) {
      resolveEnd({ status: 'ended', note: 'calls last at most 9 minutes' })
    }
    if (!busy && now - lastHeard > QUIET_MS) {
      resolveEnd({ status: 'ended', note: 'it went quiet' })
    }
  }, 1000)

  const ending = await ended
  clearInterval(watch)
  clearTimeout(pumpTimer)
  if (!theyHungUp && !sip.isClosed()) {
    // Hang up, answering one challenge on the BYE.
    let byeAuth: [string, string] | undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      const bye = cseq++
      sip.send(
        format(`BYE ${remoteTarget} SIP/2.0`, [
          ...inDialog('BYE', bye),
          ...(byeAuth ? [byeAuth] : []),
        ]),
      )
      const response = await sip.next(`${bye} BYE`, 3000)
      if (!response || byeAuth) break
      const challenge =
        (response.status === 401 || response.status === 407) &&
        pickChallenge(response)
      if (!challenge) break
      byeAuth = [
        response.status === 407 ? 'Proxy-Authorization' : 'Authorization',
        digest({
          challenge,
          method: 'BYE',
          uri: remoteTarget,
          username,
          password,
        }),
      ]
    }
  }
  sip.close()
  rtp.close()
  return { ...ending, heard }
}

const dial = internalAction({
  args: {
    callId: v.id('calls'),
    from: v.string(),
    say: v.string(),
    about: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { callId, from, say, about }) => {
    const { call, project, ownerName } = await ctx.runQuery(
      internal.api.calls.phoneCall,
      { id: callId },
    )
    let ending: Ending
    try {
      ending = call.phone
        ? await placeCall(ctx, {
            call: { ...call, phone: call.phone },
            project,
            owner: ownerName ?? 'the person you work for',
            from,
            say,
            about,
          })
        : { status: 'failed', note: 'not a phone call' }
    } catch (error) {
      console.error(error)
      ending = {
        status: 'failed',
        note: error instanceof Error ? error.message : String(error),
      }
    }
    await ctx.runMutation(internal.api.calls.setPhone, {
      id: callId,
      from,
      ...ending,
    })
    return null
  },
})

export const dialApi = { dial }
