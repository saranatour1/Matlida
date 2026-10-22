/// <reference types="node" />
'use node'

import { createHash, randomBytes } from 'node:crypto'

/**
 * Just enough SIP (RFC 3261) to place one call through Photon's Spectrum
 * server over TLS: build requests, read messages off the stream, answer a
 * digest challenge, and offer and read SDP. Only the call action uses it.
 */

export const SIP_HOST = 'sip.spectrum.photon.codes'

export type SipMessage = {
  /** Set on a request, like INVITE. */
  method?: string
  /** Set on a response, like 200. */
  status?: number
  reason?: string
  headers: Array<[string, string]>
  body: string
}

const COMPACT: Record<string, string> = {
  v: 'via',
  f: 'from',
  t: 'to',
  i: 'call-id',
  m: 'contact',
  l: 'content-length',
  c: 'content-type',
}

const nameOf = (name: string) => {
  const lower = name.toLowerCase()
  return COMPACT[lower] ?? lower
}

/** Every value of a header, in order. */
export const headers = (message: SipMessage, name: string) =>
  message.headers.filter(([n]) => nameOf(n) === name).map(([, v]) => v)

export const header = (message: SipMessage, name: string) =>
  headers(message, name).at(0)

export const randomHex = (bytes: number) => randomBytes(bytes).toString('hex')

/** A request or response, with Content-Length counted in bytes. */
export const format = (
  start: string,
  fields: Array<[string, string]>,
  body = '',
) =>
  [
    start,
    ...fields.map(([n, v]) => `${n}: ${v}`),
    `Content-Length: ${Buffer.byteLength(body)}`,
    '',
    body,
  ].join('\r\n')

const parse = (head: string, body: string): SipMessage => {
  const [start, ...lines] = head.split('\r\n')
  const fields: Array<[string, string]> = []
  for (const line of lines) {
    // A line starting with whitespace continues the header before it.
    const last = fields.at(-1)
    if (/^[ \t]/.test(line) && last) {
      last[1] += ` ${line.trim()}`
      continue
    }
    const colon = line.indexOf(':')
    if (colon > 0) {
      fields.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()])
    }
  }
  const response = /^SIP\/2\.0 (\d{3}) ?(.*)$/.exec(start)
  return response
    ? {
        status: Number(response[1]),
        reason: response[2],
        headers: fields,
        body,
      }
    : { method: start.split(' ')[0], headers: fields, body }
}

/**
 * Takes the whole messages off the front of `buffer`, read from the TLS
 * stream. Returns them and what's left, an unfinished message. Bare CRLFs
 * (keep-alives) are skipped.
 */
export const takeMessages = (
  buffer: Buffer,
): { messages: Array<SipMessage>; rest: Buffer } => {
  const messages: Array<SipMessage> = []
  let rest = buffer
  for (;;) {
    let skip = 0
    while (rest[skip] === 0x0d || rest[skip] === 0x0a) skip++
    rest = rest.subarray(skip)
    const end = rest.indexOf('\r\n\r\n')
    if (end < 0) break
    const head = rest.subarray(0, end).toString('utf8')
    const length = Number(
      /^(?:content-length|l)[ \t]*:[ \t]*(\d+)/im.exec(head)?.[1] ?? 0,
    )
    if (rest.length < end + 4 + length) break
    messages.push(
      parse(head, rest.subarray(end + 4, end + 4 + length).toString('utf8')),
    )
    rest = rest.subarray(end + 4 + length)
  }
  return { messages, rest }
}

/** The `<uri>` in a From, To or Contact value, or the value itself. */
export const uriOf = (value: string) =>
  /<([^>]+)>/.exec(value)?.[1] ?? value.split(';')[0].trim()

/** Splits a header that lists several values, like Record-Route, outside its <…>. */
export const splitList = (value: string) =>
  value.split(/,(?![^<]*>)/).map((v) => v.trim())

/** A digest challenge's fields, like realm and nonce. */
export const challengeOf = (value: string) => {
  const fields: Partial<Record<string, string>> = {}
  for (const [, key, raw] of value
    .replace(/^Digest\s+/i, '')
    .matchAll(/(\w+)=("[^"]*"|[^,\s]+)/g)) {
    fields[key.toLowerCase()] = raw.replace(/^"|"$/g, '')
  }
  return fields
}

/**
 * The Authorization (or Proxy-Authorization) value answering `challenge`
 * (RFC 2617 and RFC 7616): MD5 or SHA-256, with qop=auth when offered.
 */
export const digest = ({
  challenge,
  method,
  uri,
  username,
  password,
  cnonce = randomHex(8),
}: {
  challenge: Record<string, string | undefined>
  method: string
  uri: string
  username: string
  password: string
  cnonce?: string
}) => {
  const algorithm = challenge.algorithm ?? 'MD5'
  const hash = (text: string) =>
    createHash(algorithm.toUpperCase() === 'SHA-256' ? 'sha256' : 'md5')
      .update(text)
      .digest('hex')
  const { realm = '', nonce = '' } = challenge
  const ha1 = hash(`${username}:${realm}:${password}`)
  const ha2 = hash(`${method}:${uri}`)
  const qop = challenge.qop
    ?.split(',')
    .map((q) => q.trim())
    .includes('auth')
    ? 'auth'
    : undefined
  const nc = '00000001'
  const response = qop
    ? hash(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : hash(`${ha1}:${nonce}:${ha2}`)
  return [
    `Digest username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
    `algorithm=${algorithm}`,
    ...(qop ? [`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`] : []),
    ...(challenge.opaque ? [`opaque="${challenge.opaque}"`] : []),
  ].join(', ')
}

/** The challenge to answer in a 401 or 407: SHA-256 when offered, else the first. */
export const pickChallenge = (response: SipMessage) => {
  const offered = [
    ...headers(response, 'www-authenticate'),
    ...headers(response, 'proxy-authenticate'),
  ].map(challengeOf)
  return (
    offered.find((c) => c.algorithm?.toUpperCase() === 'SHA-256') ??
    offered.at(0)
  )
}

/** Our audio offer: PCMU at 8 kHz in 20 ms packets, at `ip`:`port`. */
// ponytail: PCMU only. Add PCMA if Photon answers 488 Not Acceptable Here.
export const sdpOffer = (ip: string, port: number) => {
  const id = Math.floor(Math.random() * 1e9)
  return [
    'v=0',
    `o=matilda ${id} ${id} IN IP4 ${ip}`,
    's=Matilda',
    `c=IN IP4 ${ip}`,
    't=0 0',
    `m=audio ${port} RTP/AVP 0 101`,
    'a=rtpmap:0 PCMU/8000',
    'a=rtpmap:101 telephone-event/8000',
    'a=fmtp:101 0-16',
    'a=ptime:20',
    'a=sendrecv',
    '',
  ].join('\r\n')
}

/** Where the other side wants our audio, from its SDP answer. Null without PCMU. */
export const sdpAnswer = (sdp: string) => {
  const ip = /^c=IN IP4 (\S+)/m.exec(sdp)?.[1]
  const media = /^m=audio (\d+) RTP\/S?AVP ([\d ]+)/m.exec(sdp)
  if (!ip || !media) return null
  if (!media[2].trim().split(/\s+/).includes('0')) return null
  return { ip, port: Number(media[1]) }
}
