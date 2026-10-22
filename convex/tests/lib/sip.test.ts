// @vitest-environment node
import { expect, test } from 'vitest'
import {
  challengeOf,
  digest,
  format,
  header,
  headers,
  pickChallenge,
  sdpAnswer,
  sdpOffer,
  splitList,
  takeMessages,
  uriOf,
} from '../../lib/sip'

const response = (value: string) => /response="([0-9a-f]+)"/.exec(value)?.[1]

test('digest matches the RFC examples, MD5 and SHA-256', () => {
  const md5 = digest({
    challenge: challengeOf(
      'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
    ),
    method: 'GET',
    uri: '/dir/index.html',
    username: 'Mufasa',
    password: 'Circle Of Life',
    cnonce: '0a4f113b',
  })
  expect(response(md5)).toBe('6629fae49393a05397450978507c4ef1')
  expect(md5).toContain('opaque="5ccc069c403ebaf9f0171e9517f40e41"')

  const sha = digest({
    challenge: challengeOf(
      'Digest realm="http-auth@example.org", qop="auth, auth-int", algorithm=SHA-256, nonce="7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v", opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"',
    ),
    method: 'GET',
    uri: '/dir/index.html',
    username: 'Mufasa',
    password: 'Circle of Life',
    cnonce: 'f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ',
  })
  expect(response(sha)).toBe(
    '753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1',
  )
  expect(sha).toContain('algorithm=SHA-256')
})

test('SHA-256 is picked over MD5 when both are offered', () => {
  const [challenge] = takeMessages(
    Buffer.from(
      format('SIP/2.0 407 Proxy Authentication Required', [
        ['Proxy-Authenticate', 'Digest realm="photon", nonce="a"'],
        [
          'Proxy-Authenticate',
          'Digest realm="photon", nonce="b", algorithm=SHA-256',
        ],
      ]),
    ),
  ).messages
  expect(pickChallenge(challenge)).toMatchObject({ nonce: 'b' })
})

test('messages come off the stream whole, bodies by their length', () => {
  const sdp = sdpOffer('203.0.113.5', 4000)
  const stream = Buffer.from(
    '\r\n' +
      format('SIP/2.0 180 Ringing', [['CSeq', '2 INVITE']]) +
      format(
        'SIP/2.0 200 OK',
        [
          ['v', 'SIP/2.0/TLS a;branch=1'],
          ['Via', 'SIP/2.0/TLS b;branch=2'],
          ['CSeq', '2 INVITE'],
          ['Record-Route', '<sip:p1;lr>, <sip:p2;lr>'],
          ['m', '<sip:them@198.51.100.7:5061;transport=tls>'],
        ],
        sdp,
      ) +
      'BYE sip:x SIP/2.0\r\nCSeq: 3 BYE\r\nContent-Le',
  )
  const { messages, rest } = takeMessages(stream)
  expect(messages.map((m) => m.status)).toEqual([180, 200])
  const ok = messages[1]
  expect(ok.body).toBe(sdp)
  expect(headers(ok, 'via')).toHaveLength(2)
  expect(uriOf(header(ok, 'contact') ?? '')).toBe(
    'sip:them@198.51.100.7:5061;transport=tls',
  )
  expect(splitList(header(ok, 'record-route') ?? '')).toEqual([
    '<sip:p1;lr>',
    '<sip:p2;lr>',
  ])
  expect(rest.toString()).toMatch(/^BYE/)
  const bye = takeMessages(
    Buffer.concat([rest, Buffer.from('ngth: 0\r\n\r\n')]),
  )
  expect(bye.messages[0]).toMatchObject({ method: 'BYE' })
})

test('the SDP answer gives where to send PCMU', () => {
  expect(
    sdpAnswer(
      'v=0\r\nc=IN IP4 198.51.100.7\r\nm=audio 30000 RTP/AVP 0 101\r\n',
    ),
  ).toEqual({ ip: '198.51.100.7', port: 30000 })
  expect(
    sdpAnswer('v=0\r\nc=IN IP4 198.51.100.7\r\nm=audio 30000 RTP/AVP 8\r\n'),
  ).toBeNull()
})
